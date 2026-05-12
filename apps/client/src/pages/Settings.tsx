import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { isAxiosError } from 'axios';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { getBillingStatus, startPremiumCheckout } from '../api/billing';
import { fetchCountriesCatalog } from '../api/countries';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type {
  BillingStatusResponse,
  CountriesCatalog,
  CurrencyCode,
  UpdateUserPreferencesPayload,
  UserPreferences,
} from '../types';

type SettingsUser = {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  githubLinked: boolean;
  githubLogin: string | null;
  googleLinked: boolean;
  googleEmail: string | null;
};

type PreferencesDraft = {
  preferredLanguage: 'en' | 'ru';
  preferredTheme: 'light' | 'dark';
  preferredCurrency: CurrencyCode;
  defaultTargetCountry: string;
  defaultTargetCity: string;
  weeklyStudyHours: number;
  preferredReportLanguage: 'en' | 'ru';
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (en)' },
  { value: 'ru', label: 'Russian (ru)' },
] as const;

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

const CURRENCY_OPTIONS: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH'];

const emptyPreferencesDraft: PreferencesDraft = {
  preferredLanguage: 'en',
  preferredTheme: 'light',
  preferredCurrency: 'USD',
  defaultTargetCountry: '',
  defaultTargetCity: '',
  weeklyStudyHours: 8,
  preferredReportLanguage: 'en',
};

function toDraft(preferences: UserPreferences): PreferencesDraft {
  return {
    preferredLanguage: preferences.preferredLanguage,
    preferredTheme: preferences.preferredTheme,
    preferredCurrency: preferences.preferredCurrency,
    defaultTargetCountry: preferences.defaultTargetCountry ?? '',
    defaultTargetCity: preferences.defaultTargetCity ?? '',
    weeklyStudyHours: preferences.weeklyStudyHours,
    preferredReportLanguage: preferences.preferredReportLanguage,
  };
}

function buildGithubLinkUrl(token: string | null) {
  const params = new URLSearchParams({ returnTo: '/settings' });
  if (token) {
    params.set('access_token', token);
  }
  return `/api/auth/github/link?${params.toString()}`;
}

function buildGoogleLinkUrl(token: string | null) {
  const params = new URLSearchParams({ returnTo: '/settings' });
  if (token) {
    params.set('access_token', token);
  }
  return `/api/auth/google/link?${params.toString()}`;
}

function mapOAuthError(code: string | null) {
  if (!code) return null;
  if (code === 'oauth_identity_conflict') {
    return 'This OAuth account is already linked to another user.';
  }
  if (code === 'oauth_invalid_state') {
    return 'OAuth link session expired. Please try again.';
  }
  if (code === 'oauth_provider_failure') {
    return 'OAuth flow failed. Please retry.';
  }
  if (code === 'oauth_email_mismatch') {
    return 'Google account email must match your ReloPlanner account email for linking.';
  }
  if (code === 'email_verify_invalid') {
    return 'Email verification link is invalid or expired. Request a new one.';
  }
  return 'OAuth linking failed.';
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser, token } = useAuth();
  const { setColorScheme } = useMantineColorScheme();
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [upgradeModalOpened, setUpgradeModalOpened] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesInfo, setPreferencesInfo] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [preferencesDraft, setPreferencesDraft] =
    useState<PreferencesDraft>(emptyPreferencesDraft);
  const [countriesCatalog, setCountriesCatalog] = useState<CountriesCatalog>({
    target: [],
    source: [],
  });

  const successLinked = searchParams.get('githubLinked') === '1';
  const successGoogleLinked = searchParams.get('googleLinked') === '1';
  const successEmailVerified = searchParams.get('emailVerified') === '1';
  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');
  const oauthError = mapOAuthError(searchParams.get('error'));

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await client.get<SettingsUser>('/auth/me');
      setUser(res.data);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404 && authUser) {
        setUser({
          id: authUser.id,
          email: authUser.email,
          role: authUser.role,
          emailVerified: false,
          emailVerifiedAt: null,
          githubLinked: false,
          githubLogin: null,
          googleLinked: false,
          googleEmail: null,
        });
        setLoadError(
          'Backend /auth/me endpoint is unavailable. Restart backend to see current OAuth link status.',
        );
      } else {
        setLoadError('Failed to load settings.');
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  const loadBilling = useCallback(async () => {
    if (!authUser) {
      setBillingStatus(null);
      return;
    }
    setBillingLoading(true);
    try {
      const data = await getBillingStatus();
      setBillingStatus(data);
    } catch {
      setBillingStatus(null);
    } finally {
      setBillingLoading(false);
    }
  }, [authUser]);

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const current = await fetchMyPreferences();
      if (!current) {
        setPreferences(null);
        setPreferencesDraft(emptyPreferencesDraft);
        setPreferencesError('Failed to load user preferences.');
        return;
      }
      setPreferences(current);
      setPreferencesDraft(toDraft(current));
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBilling();
    void loadPreferences();
    void (async () => {
      const catalog = await fetchCountriesCatalog();
      setCountriesCatalog(catalog);
    })();
  }, [load, loadBilling, loadPreferences]);

  const handleResendVerification = async () => {
    setResending(true);
    setResendInfo(null);
    try {
      const response = await client.post<{
        sent: boolean;
        alreadyVerified: boolean;
      }>('/auth/email/resend-verification');

      if (response.data.alreadyVerified) {
        setResendInfo('Email is already verified.');
      } else if (response.data.sent) {
        setResendInfo('Verification email sent.');
      } else {
        setResendInfo('SMTP is not configured, verification email was not sent.');
      }
      await load();
    } catch {
      setResendInfo('Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    setUpgradeError(null);
    setResendInfo(null);
    try {
      const urls = buildCheckoutReturnUrls('/settings', searchParams);
      const checkout = await startPremiumCheckout(urls);
      if (!checkout.checkoutUrl) {
        throw new Error('Checkout URL was not returned by billing provider.');
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      const message = isAxiosError(error)
        ? String(error.response?.data?.message ?? error.message)
        : 'Upgrade failed';
      setUpgradeError(message);
      await loadBilling();
    } finally {
      setUpgradeLoading(false);
    }
  };

  useEffect(() => {
    if (!checkoutAction || !checkoutSessionId) return;

    let canceled = false;
    setCheckoutProcessing(true);
    setUpgradeError(null);

    void (async () => {
      try {
        const resolved = await pollCheckoutStatus(checkoutSessionId);
        if (canceled) return;

        if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
          setUpgradeModalOpened(false);
          setResendInfo('Premium activated successfully.');
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setUpgradeError('Checkout was canceled before completion.');
        } else if (resolved.paymentStatus === 'PENDING') {
          setUpgradeError(
            'Checkout is still pending webhook confirmation. Refresh shortly if status does not update.',
          );
        } else {
          setUpgradeError(
            resolved.errorMessage ?? 'Checkout failed. Please retry with Stripe test card details.',
          );
        }

        await Promise.all([load(), loadBilling()]);
      } catch (error) {
        if (canceled) return;
        const message = isAxiosError(error)
          ? String(error.response?.data?.message ?? error.message)
          : 'Failed to resolve checkout status.';
        setUpgradeError(message);
      } finally {
        if (canceled) return;
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, load, loadBilling]);

  const handleSavePreferences = async () => {
    if (preferencesDraft.weeklyStudyHours < 1 || preferencesDraft.weeklyStudyHours > 40) {
      setPreferencesError('Weekly study hours must be between 1 and 40.');
      return;
    }

    const normalizedCountry = preferencesDraft.defaultTargetCountry.trim().toUpperCase();
    const normalizedCity = preferencesDraft.defaultTargetCity.trim();

    const payload: UpdateUserPreferencesPayload = {
      preferredLanguage: preferencesDraft.preferredLanguage,
      preferredTheme: preferencesDraft.preferredTheme,
      preferredCurrency: preferencesDraft.preferredCurrency,
      defaultTargetCountry: normalizedCountry || null,
      defaultTargetCity: normalizedCity || null,
      weeklyStudyHours: preferencesDraft.weeklyStudyHours,
      preferredReportLanguage: preferencesDraft.preferredReportLanguage,
    };

    setPreferencesSaving(true);
    setPreferencesError(null);
    setPreferencesInfo(null);
    try {
      const updated = await updateMyPreferences(payload);
      setPreferences(updated);
      setPreferencesDraft(toDraft(updated));
      setColorScheme(updated.preferredTheme);
      setPreferencesInfo('Preferences saved.');
    } catch (error) {
      const message = isAxiosError(error)
        ? String(error.response?.data?.message ?? error.message)
        : 'Failed to save preferences.';
      setPreferencesError(message);
    } finally {
      setPreferencesSaving(false);
    }
  };

  const emailStatus = useMemo(() => {
    if (!user) {
      return null;
    }
    if (user.emailVerified) {
      return <Badge color="teal">Verified</Badge>;
    }
    return <Badge color="orange">Unverified</Badge>;
  }, [user]);

  const currentPlanCode =
    billingStatus?.plan.code ??
    (user?.role === 'PREMIUM' ? 'PREMIUM' : user?.role === 'ADMIN' ? 'PREMIUM' : 'FREE');
  const currentPlanName = billingStatus?.plan.name ??
    (currentPlanCode === 'PREMIUM' ? 'Premium' : 'Free');
  const jobMatchLimit =
    billingStatus?.entitlements?.features?.JOB_MATCH_LIMIT?.limit ?? null;

  const githubStatus = useMemo(() => {
    if (!user?.githubLinked) {
      return <Badge color="gray">Not linked</Badge>;
    }
    return (
      <Badge color="teal">
        Linked{user.githubLogin ? ` (@${user.githubLogin})` : ''}
      </Badge>
    );
  }, [user]);

  const googleStatus = useMemo(() => {
    if (!user?.googleLinked) {
      return <Badge color="gray">Not linked</Badge>;
    }
    return (
      <Badge color="teal">
        Linked{user.googleEmail ? ` (${user.googleEmail})` : ''}
      </Badge>
    );
  }, [user]);

  const handleLinkGithub = () => {
    window.location.assign(buildGithubLinkUrl(token));
  };

  const handleLinkGoogle = () => {
    window.location.assign(buildGoogleLinkUrl(token));
  };

  const handleUnlinkGithub = async () => {
    try {
      await client.post('/auth/github/unlink');
      await load();
    } catch {
      setLoadError('Failed to unlink GitHub account.');
    }
  };

  const handleUnlinkGoogle = async () => {
    try {
      await client.post('/auth/google/unlink');
      await load();
    } catch {
      setLoadError('Failed to unlink Google account.');
    }
  };

  const countryOptions = useMemo(
    () =>
      countriesCatalog.target.map((country) => ({
        value: country.code,
        label: `${country.name} (${country.code})`,
      })),
    [countriesCatalog.target],
  );

  const suggestedCities = useMemo(() => {
    if (!preferencesDraft.defaultTargetCountry) return [] as string[];
    const selected = countriesCatalog.target.find(
      (country) => country.code === preferencesDraft.defaultTargetCountry,
    );
    return selected?.suggestedCities ?? [];
  }, [countriesCatalog.target, preferencesDraft.defaultTargetCountry]);

  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <Stack gap="lg">
        <Title order={2}>Settings</Title>

        {successLinked && (
          <Alert color="teal">GitHub profile linked successfully.</Alert>
        )}
        {successGoogleLinked && (
          <Alert color="teal">Google profile linked successfully.</Alert>
        )}
        {successEmailVerified && (
          <Alert color="teal">Email verified successfully.</Alert>
        )}
        {oauthError && <Alert color="red">{oauthError}</Alert>}
        {checkoutProcessing && (
          <Alert color="blue">Processing Stripe checkout status...</Alert>
        )}
        {loadError && <Alert color="red">{loadError}</Alert>}
        {resendInfo && <Alert color="blue">{resendInfo}</Alert>}
        {preferencesError && <Alert color="red">{preferencesError}</Alert>}
        {preferencesInfo && <Alert color="teal">{preferencesInfo}</Alert>}

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>Preferences</Title>
            <Text size="sm" c="dimmed">
              Personalization settings used across knowledge base, profile defaults, and report locale.
            </Text>
            <Select
              label="Preferred Language"
              data={LANGUAGE_OPTIONS}
              value={preferencesDraft.preferredLanguage}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredLanguage: (value as 'en' | 'ru') || 'en',
                }))
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label="Preferred Report Language"
              data={LANGUAGE_OPTIONS}
              value={preferencesDraft.preferredReportLanguage}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredReportLanguage: (value as 'en' | 'ru') || 'en',
                }))
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label="Preferred Theme"
              data={THEME_OPTIONS}
              value={preferencesDraft.preferredTheme}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredTheme: (value as 'light' | 'dark') || 'light',
                }))
              }
              description="Applied globally after saving preferences."
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label="Preferred Currency"
              data={CURRENCY_OPTIONS.map((value) => ({ value, label: value }))}
              value={preferencesDraft.preferredCurrency}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredCurrency: (value as CurrencyCode) || 'USD',
                }))
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label="Default Target Country"
              data={countryOptions}
              value={preferencesDraft.defaultTargetCountry || null}
              clearable
              searchable
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  defaultTargetCountry: value ?? '',
                }))
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <TextInput
              label="Default Target City"
              placeholder="Optional city (e.g., Berlin)"
              value={preferencesDraft.defaultTargetCity}
              onChange={(event) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  defaultTargetCity: event.currentTarget.value,
                }))
              }
              description={
                suggestedCities.length > 0
                  ? `Suggested for selected country: ${suggestedCities.join(', ')}`
                  : 'Can be a custom non-empty city value.'
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <NumberInput
              label="Weekly Study Hours"
              min={1}
              max={40}
              value={preferencesDraft.weeklyStudyHours}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  weeklyStudyHours: Math.max(1, Math.min(40, Number(value) || 1)),
                }))
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <Button
              color="brand.7"
              onClick={handleSavePreferences}
              loading={preferencesSaving}
              disabled={preferencesLoading}
            >
              Save Preferences
            </Button>
            {preferences && (
              <Text size="xs" c="dimmed">
                Last updated: {new Date(preferences.updatedAt).toLocaleString()}
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>Email Verification</Title>
            <Text size="sm" c="dimmed">
              Email: {user?.email || authUser?.email || 'unknown'}
            </Text>
            {loading ? <Text size="sm">Loading...</Text> : emailStatus}
            <Button
              color="brand.7"
              variant={user?.emailVerified ? 'light' : 'filled'}
              onClick={handleResendVerification}
              loading={resending}
              disabled={loading || !user || Boolean(user.emailVerified)}
            >
              {user?.emailVerified ? 'Email Verified' : 'Resend Verification Email'}
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>Subscription</Title>
            <Text size="sm" c="dimmed">
              Current plan and billing status for premium feature access.
            </Text>
            <Badge
              color={currentPlanCode === 'PREMIUM' ? 'teal' : 'gray'}
              variant="light"
              w="fit-content"
            >
              Plan: {currentPlanName}
            </Badge>
            {billingLoading ? (
              <Text size="sm">Loading billing status...</Text>
            ) : (
              <Stack gap={6}>
                <Text size="sm" c="dimmed">
                  Subscription status: {billingStatus?.subscription.status ?? 'UNKNOWN'}
                </Text>
                <Text size="sm" c="dimmed">
                  Subscription end: {billingStatus?.subscription.expiresAt
                    ? new Date(billingStatus.subscription.expiresAt).toLocaleString()
                    : 'n/a'}
                </Text>
                {jobMatchLimit ? (
                  <Text size="sm" c="dimmed">
                    Job matching usage: Top {jobMatchLimit} of 20
                  </Text>
                ) : null}
                <Text size="sm" c="dimmed">
                  Open full plan details to view Stripe subscription status and full payment history.
                </Text>
              </Stack>
            )}
            <Button
              component={RouterLink}
              to="/plan"
              variant="outline"
              color="brand.8"
            >
              Open Plan and Billing
            </Button>
            {currentPlanCode !== 'PREMIUM' ? (
              <Button
                color="brand.7"
                onClick={() => {
                  setUpgradeError(null);
                  setUpgradeModalOpened(true);
                }}
                disabled={upgradeLoading}
              >
                Upgrade to Premium
              </Button>
            ) : (
              <Button color="teal" variant="light" disabled>
                Premium Active
              </Button>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>GitHub Integration</Title>
            <Text size="sm" c="dimmed">
              Link your GitHub profile to unlock GitHub-based profile analysis
              flows in upcoming features.
            </Text>
            {loading ? <Text size="sm">Loading...</Text> : githubStatus}
            <Button
              color="brand.7"
              variant={user?.githubLinked ? 'light' : 'filled'}
              onClick={handleLinkGithub}
            >
              {user?.githubLinked ? 'Relink GitHub Profile' : 'Link GitHub Profile'}
            </Button>
            <Button
              variant="outline"
              color="red"
              onClick={handleUnlinkGithub}
              disabled={!user?.githubLinked}
            >
              Unlink GitHub Profile
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>Google Integration</Title>
            <Text size="sm" c="dimmed">
              Link your Google profile to support Google-based login and future
              account signals.
            </Text>
            {loading ? <Text size="sm">Loading...</Text> : googleStatus}
            <Button
              color="brand.7"
              variant={user?.googleLinked ? 'light' : 'filled'}
              onClick={handleLinkGoogle}
            >
              {user?.googleLinked ? 'Relink Google Profile' : 'Link Google Profile'}
            </Button>
            <Button
              variant="outline"
              color="red"
              onClick={handleUnlinkGoogle}
              disabled={!user?.googleLinked}
            >
              Unlink Google Profile
            </Button>
          </Stack>
        </Paper>

        <PremiumUpgradeModal
          opened={upgradeModalOpened}
          onClose={() => setUpgradeModalOpened(false)}
          onUpgrade={handleUpgrade}
          loading={upgradeLoading}
          featureName="Premium billing access"
          errorMessage={upgradeError}
        />
      </Stack>
    </div>
  );
}
