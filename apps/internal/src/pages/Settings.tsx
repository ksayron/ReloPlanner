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
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { getBillingStatus, startPremiumCheckout } from '../api/billing';
import { fetchCountriesCatalog } from '../api/countries';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
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

function mapOAuthError(code: string | null, t: (key: string) => string) {
  if (!code) return null;
  if (code === 'oauth_identity_conflict') {
    return t('oauthIdentityConflict');
  }
  if (code === 'oauth_invalid_state') {
    return t('oauthInvalidState');
  }
  if (code === 'oauth_provider_failure') {
    return t('oauthProviderFailure');
  }
  if (code === 'oauth_email_mismatch') {
    return t('oauthEmailMismatch');
  }
  if (code === 'email_verify_invalid') {
    return t('oauthEmailVerifyInvalid');
  }
  return t('oauthLinkingFailed');
}

export default function Settings() {
  const { t } = useTranslation(['settings', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: authUser, token } = useAuth();
  const { language, setLanguage } = useAppLanguage();
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
  const oauthError = mapOAuthError(searchParams.get('error'), (key) => t(key, { ns: 'settings' }));

  const languageOptions = useMemo(
    () => [
      { value: 'en', label: `${t('english', { ns: 'common' })} (en)` },
      { value: 'ru', label: `${t('russian', { ns: 'common' })} (ru)` },
    ],
    [t],
  );

  const themeOptions = useMemo(
    () => [
      { value: 'light', label: t('lightTheme', { ns: 'settings' }) },
      { value: 'dark', label: t('darkTheme', { ns: 'settings' }) },
    ],
    [t],
  );

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
        setLoadError(t('backendAuthUnavailable', { ns: 'settings' }));
      } else {
        setLoadError(t('failedLoadSettings', { ns: 'settings' }));
      }
    } finally {
      setLoading(false);
    }
  }, [authUser, t]);

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
        setPreferencesError(t('failedLoadPreferences', { ns: 'settings' }));
        return;
      }
      setPreferences(current);
      setPreferencesDraft(toDraft(current));
    } finally {
      setPreferencesLoading(false);
    }
  }, [t]);

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
        setResendInfo(t('emailAlreadyVerified', { ns: 'settings' }));
      } else if (response.data.sent) {
        setResendInfo(t('verificationEmailSent', { ns: 'settings' }));
      } else {
        setResendInfo(t('smtpNotConfigured', { ns: 'settings' }));
      }
      await load();
    } catch {
      setResendInfo(t('failedResendVerification', { ns: 'settings' }));
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
        throw new Error(t('checkoutMissingUrl', { ns: 'plan' }));
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      const message = isAxiosError(error)
        ? String(error.response?.data?.message ?? error.message)
        : t('upgradeFailed', { ns: 'plan' });
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
          setResendInfo(t('premiumActivated', { ns: 'plan' }));
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setUpgradeError(t('checkoutCanceled', { ns: 'plan' }));
        } else if (resolved.paymentStatus === 'PENDING') {
          setUpgradeError(t('checkoutPending', { ns: 'plan' }));
        } else {
          setUpgradeError(resolved.errorMessage ?? t('checkoutFailed', { ns: 'plan' }));
        }

        await Promise.all([load(), loadBilling()]);
      } catch (error) {
        if (canceled) return;
        const message = isAxiosError(error)
          ? String(error.response?.data?.message ?? error.message)
          : t('failedResolveCheckout', { ns: 'plan' });
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
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, load, loadBilling, t]);

  const handleSavePreferences = async () => {
    if (preferencesDraft.weeklyStudyHours < 1 || preferencesDraft.weeklyStudyHours > 40) {
      setPreferencesError(t('weeklyHoursRange', { ns: 'settings' }));
      return;
    }

    const normalizedCountry = preferencesDraft.defaultTargetCountry.trim().toUpperCase();
    const normalizedCity = preferencesDraft.defaultTargetCity.trim();

    const payload: UpdateUserPreferencesPayload = {
      preferredLanguage: language,
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
      if (updated.preferredLanguage !== language) {
        await setLanguage(updated.preferredLanguage);
      }
      setPreferencesInfo(t('preferencesSaved', { ns: 'settings' }));
    } catch (error) {
      const message = isAxiosError(error)
        ? String(error.response?.data?.message ?? error.message)
        : t('failedSavePreferences', { ns: 'settings' });
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
      return <Badge color="teal">{t('verified', { ns: 'settings' })}</Badge>;
    }
    return <Badge color="orange">{t('unverified', { ns: 'settings' })}</Badge>;
  }, [t, user]);

  const currentPlanCode =
    billingStatus?.plan.code ??
    (user?.role === 'PREMIUM' ? 'PREMIUM' : user?.role === 'ADMIN' ? 'PREMIUM' : 'FREE');
  const currentPlanName = billingStatus?.plan.name ??
    (currentPlanCode === 'PREMIUM' ? t('premium', { ns: 'common' }) : t('free', { ns: 'common' }));
  const jobMatchLimit =
    billingStatus?.entitlements?.features?.JOB_MATCH_LIMIT?.limit ?? null;

  const githubStatus = useMemo(() => {
    if (!user?.githubLinked) {
      return <Badge color="gray">{t('notLinked', { ns: 'settings' })}</Badge>;
    }
    return (
      <Badge color="teal">
        {t('linked', { ns: 'settings' })}{user.githubLogin ? ` (@${user.githubLogin})` : ''}
      </Badge>
    );
  }, [t, user]);

  const googleStatus = useMemo(() => {
    if (!user?.googleLinked) {
      return <Badge color="gray">{t('notLinked', { ns: 'settings' })}</Badge>;
    }
    return (
      <Badge color="teal">
        {t('linked', { ns: 'settings' })}{user.googleEmail ? ` (${user.googleEmail})` : ''}
      </Badge>
    );
  }, [t, user]);

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
      setLoadError(t('failedUnlinkGithub', { ns: 'settings' }));
    }
  };

  const handleUnlinkGoogle = async () => {
    try {
      await client.post('/auth/google/unlink');
      await load();
    } catch {
      setLoadError(t('failedUnlinkGoogle', { ns: 'settings' }));
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
        <Title order={2}>{t('title', { ns: 'settings' })}</Title>

        {successLinked && (
          <Alert color="teal">{t('githubLinkedSuccess', { ns: 'settings' })}</Alert>
        )}
        {successGoogleLinked && (
          <Alert color="teal">{t('googleLinkedSuccess', { ns: 'settings' })}</Alert>
        )}
        {successEmailVerified && (
          <Alert color="teal">{t('emailVerifiedSuccess', { ns: 'settings' })}</Alert>
        )}
        {oauthError && <Alert color="red">{oauthError}</Alert>}
        {checkoutProcessing && (
          <Alert color="blue">{t('processingCheckout', { ns: 'settings' })}</Alert>
        )}
        {loadError && <Alert color="red">{loadError}</Alert>}
        {resendInfo && <Alert color="blue">{resendInfo}</Alert>}
        {preferencesError && <Alert color="red">{preferencesError}</Alert>}
        {preferencesInfo && <Alert color="teal">{preferencesInfo}</Alert>}

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>{t('preferences', { ns: 'settings' })}</Title>
            <Text size="sm" c="dimmed">
              {t('preferencesDescription', { ns: 'settings' })}
            </Text>
            <Select
              label={t('preferredLanguage', { ns: 'settings' })}
              data={languageOptions}
              value={language}
              onChange={(value) => {
                if (!value || (value !== 'en' && value !== 'ru')) return;
                void setLanguage(value);
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredLanguage: value,
                }));
              }}
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label={t('preferredReportLanguage', { ns: 'settings' })}
              data={languageOptions}
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
              label={t('preferredTheme', { ns: 'settings' })}
              data={themeOptions}
              value={preferencesDraft.preferredTheme}
              onChange={(value) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  preferredTheme: (value as 'light' | 'dark') || 'light',
                }))
              }
              description={t('preferredThemeHint', { ns: 'settings' })}
              disabled={preferencesLoading || preferencesSaving}
            />
            <Select
              label={t('preferredCurrency', { ns: 'settings' })}
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
              label={t('defaultTargetCountry', { ns: 'settings' })}
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
              label={t('defaultTargetCity', { ns: 'settings' })}
              placeholder={t('defaultTargetCityPlaceholder', { ns: 'settings' })}
              value={preferencesDraft.defaultTargetCity}
              onChange={(event) =>
                setPreferencesDraft((prev) => ({
                  ...prev,
                  defaultTargetCity: event.currentTarget.value,
                }))
              }
              description={
                suggestedCities.length > 0
                  ? t('suggestedCities', { ns: 'settings', cities: suggestedCities.join(', ') })
                  : t('customCityHint', { ns: 'settings' })
              }
              disabled={preferencesLoading || preferencesSaving}
            />
            <NumberInput
              label={t('weeklyStudyHours', { ns: 'settings' })}
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
              {t('savePreferences', { ns: 'settings' })}
            </Button>
            {preferences && (
              <Text size="xs" c="dimmed">
                {t('lastUpdated', { ns: 'settings' })}:{' '}
                {new Date(preferences.updatedAt).toLocaleString(language)}
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>{t('emailVerification', { ns: 'settings' })}</Title>
            <Text size="sm" c="dimmed">
              {t('emailLabel', { ns: 'settings' })}: {user?.email || authUser?.email || t('unknown', { ns: 'settings' })}
            </Text>
            {loading ? <Text size="sm">{t('loading', { ns: 'common' })}</Text> : emailStatus}
            <Button
              color="brand.7"
              variant={user?.emailVerified ? 'light' : 'filled'}
              onClick={handleResendVerification}
              loading={resending}
              disabled={loading || !user || Boolean(user.emailVerified)}
            >
              {user?.emailVerified
                ? t('emailVerified', { ns: 'settings' })
                : t('resendVerification', { ns: 'settings' })}
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>{t('subscription', { ns: 'settings' })}</Title>
            <Text size="sm" c="dimmed">
              {t('subscriptionDescription', { ns: 'settings' })}
            </Text>
            <Badge
              color={currentPlanCode === 'PREMIUM' ? 'teal' : 'gray'}
              variant="light"
              w="fit-content"
            >
              {t('plan', { ns: 'settings' })}: {currentPlanName}
            </Badge>
            {billingLoading ? (
              <Text size="sm">{t('loadingBillingStatus', { ns: 'settings' })}</Text>
            ) : (
              <Stack gap={6}>
                <Text size="sm" c="dimmed">
                  {t('subscriptionStatus', { ns: 'settings' })}:{' '}
                  {billingStatus?.subscription.status ?? 'UNKNOWN'}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('subscriptionEnd', { ns: 'settings' })}:{' '}
                  {billingStatus?.subscription.expiresAt
                    ? new Date(billingStatus.subscription.expiresAt).toLocaleString(language)
                    : t('na', { ns: 'common' })}
                </Text>
                {jobMatchLimit ? (
                  <Text size="sm" c="dimmed">
                    {t('jobMatchingUsage', { ns: 'settings', count: jobMatchLimit })}
                  </Text>
                ) : null}
                <Text size="sm" c="dimmed">
                  {t('planDetailsHint', { ns: 'settings' })}
                </Text>
              </Stack>
            )}
            <Button
              component={RouterLink}
              to="/plan"
              variant="outline"
              color="brand.8"
            >
              {t('openPlanAndBilling', { ns: 'settings' })}
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
                {t('upgradeToPremium', { ns: 'settings' })}
              </Button>
            ) : (
              <Button color="teal" variant="light" disabled>
                {t('premiumActive', { ns: 'settings' })}
              </Button>
            )}
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>{t('githubIntegration', { ns: 'settings' })}</Title>
            <Text size="sm" c="dimmed">
              {t('githubIntegrationDescription', { ns: 'settings' })}
            </Text>
            {loading ? <Text size="sm">{t('loading', { ns: 'common' })}</Text> : githubStatus}
            <Button
              color="brand.7"
              variant={user?.githubLinked ? 'light' : 'filled'}
              onClick={handleLinkGithub}
            >
              {user?.githubLinked
                ? t('relinkGithub', { ns: 'settings' })
                : t('linkGithub', { ns: 'settings' })}
            </Button>
            <Button
              variant="outline"
              color="red"
              onClick={handleUnlinkGithub}
              disabled={!user?.githubLinked}
            >
              {t('unlinkGithub', { ns: 'settings' })}
            </Button>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="xl" className="bg-white">
          <Stack gap="md">
            <Title order={4}>{t('googleIntegration', { ns: 'settings' })}</Title>
            <Text size="sm" c="dimmed">
              {t('googleIntegrationDescription', { ns: 'settings' })}
            </Text>
            {loading ? <Text size="sm">{t('loading', { ns: 'common' })}</Text> : googleStatus}
            <Button
              color="brand.7"
              variant={user?.googleLinked ? 'light' : 'filled'}
              onClick={handleLinkGoogle}
            >
              {user?.googleLinked
                ? t('relinkGoogle', { ns: 'settings' })
                : t('linkGoogle', { ns: 'settings' })}
            </Button>
            <Button
              variant="outline"
              color="red"
              onClick={handleUnlinkGoogle}
              disabled={!user?.googleLinked}
            >
              {t('unlinkGoogle', { ns: 'settings' })}
            </Button>
          </Stack>
        </Paper>

        <PremiumUpgradeModal
          opened={upgradeModalOpened}
          onClose={() => setUpgradeModalOpened(false)}
          onUpgrade={handleUpgrade}
          loading={upgradeLoading}
          featureName={t('premiumBillingAccess', { ns: 'settings' })}
          errorMessage={upgradeError}
        />
      </Stack>
    </div>
  );
}
