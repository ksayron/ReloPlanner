import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Paper, Stack, Text, Title } from '@mantine/core';
import { isAxiosError } from 'axios';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';
import { confirmCheckout, getBillingStatus, startPremiumCheckout } from '../api/billing';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import type { BillingStatusResponse } from '../types';

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
  const [searchParams] = useSearchParams();
  const { user: authUser, token } = useAuth();
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

  const successLinked = searchParams.get('githubLinked') === '1';
  const successGoogleLinked = searchParams.get('googleLinked') === '1';
  const successEmailVerified = searchParams.get('emailVerified') === '1';
  const oauthError = mapOAuthError(searchParams.get('error'));

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

  useEffect(() => {
    void load();
    void loadBilling();
  }, [load, loadBilling]);

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
      const checkout = await startPremiumCheckout();
      const resolved = await confirmCheckout(checkout.checkoutSessionId);
      if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
        setUpgradeModalOpened(false);
        setResendInfo('Premium activated successfully.');
      } else {
        setUpgradeError(
          resolved.errorMessage ??
            'Checkout did not succeed. Development mode may intentionally simulate failures.',
        );
      }
      await Promise.all([load(), loadBilling()]);
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
  const premiumFeatureIndicators = [
    { code: 'AI_DETAILED_REPORT', label: 'AI detailed report' },
    { code: 'PDF_EXPORT', label: 'PDF export' },
    { code: 'EXPANDED_JOB_MATCHING', label: 'Expanded job matching' },
  ] as const;
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
        {loadError && <Alert color="red">{loadError}</Alert>}
        {resendInfo && <Alert color="blue">{resendInfo}</Alert>}

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
                {jobMatchLimit ? (
                  <Text size="sm" c="dimmed">
                    Job matching usage: Top {jobMatchLimit} of 20
                  </Text>
                ) : null}
                <Stack gap={4}>
                  {premiumFeatureIndicators.map((feature) => {
                    const enabled = Boolean(
                      billingStatus?.entitlements?.features?.[feature.code]?.enabled,
                    );
                    return (
                      <Badge
                        key={feature.code}
                        color={enabled ? 'teal' : 'gray'}
                        variant="light"
                        w="fit-content"
                      >
                        {feature.label}: {enabled ? 'Unlocked' : 'Premium'}
                      </Badge>
                    );
                  })}
                </Stack>
              </Stack>
            )}
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
            {billingStatus?.payments?.length ? (
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Recent payments
                </Text>
                {billingStatus.payments.slice(0, 3).map((payment) => (
                  <Text key={payment.id} size="xs" c="dimmed">
                    {new Date(payment.createdAt).toLocaleString()} | {payment.status} |{' '}
                    {payment.amount.toFixed(2)} {payment.currency}
                    {payment.errorMessage ? ` | ${payment.errorMessage}` : ''}
                  </Text>
                ))}
              </Stack>
            ) : null}
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
