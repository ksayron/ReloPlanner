import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Paper, Stack, Text, Title } from '@mantine/core';
import { isAxiosError } from 'axios';
import client from '../api/client';
import { useAuth } from '../api/AuthContext';

type SettingsUser = {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  githubLinked: boolean;
  githubLogin: string | null;
};

function buildGithubLinkUrl() {
  const params = new URLSearchParams({ returnTo: '/settings' });
  return `/api/auth/github/link?${params.toString()}`;
}

function mapOAuthError(code: string | null) {
  if (!code) return null;
  if (code === 'oauth_identity_conflict') {
    return 'This GitHub account is already linked to another user.';
  }
  if (code === 'oauth_invalid_state') {
    return 'GitHub link session expired. Please try again.';
  }
  if (code === 'oauth_provider_failure') {
    return 'GitHub OAuth failed. Please retry.';
  }
  if (code === 'email_verify_invalid') {
    return 'Email verification link is invalid or expired. Request a new one.';
  }
  return 'GitHub linking failed.';
}

export default function Settings() {
  const [searchParams] = useSearchParams();
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resendInfo, setResendInfo] = useState<string | null>(null);

  const successLinked = searchParams.get('githubLinked') === '1';
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
        });
        setLoadError(
          'Backend /auth/me endpoint is unavailable. Restart backend to see current GitHub link status.',
        );
      } else {
        setLoadError('Failed to load settings.');
      }
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const emailStatus = useMemo(() => {
    if (!user) {
      return null;
    }
    if (user.emailVerified) {
      return <Badge color="teal">Verified</Badge>;
    }
    return <Badge color="orange">Unverified</Badge>;
  }, [user]);

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

  const handleLinkGithub = () => {
    window.location.assign(buildGithubLinkUrl());
  };

  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <Stack gap="lg">
        <Title order={2}>Settings</Title>

        {successLinked && (
          <Alert color="teal">GitHub profile linked successfully.</Alert>
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
          </Stack>
        </Paper>
      </Stack>
    </div>
  );
}
