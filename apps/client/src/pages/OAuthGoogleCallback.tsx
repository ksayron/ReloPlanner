import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../api/AuthContext';
import { useTranslation } from 'react-i18next';

const exchangedCodes = new Set<string>();
const exchangeInFlight = new Map<string, Promise<void>>();

function normalizeReturnTo(value: string | null) {
  if (!value) return '/wizard';
  if (!value.startsWith('/')) return '/wizard';
  if (value.startsWith('//')) return '/wizard';
  return value;
}

function exchangeOnce(code: string, exchangeOAuthCode: (code: string) => Promise<void>) {
  if (exchangedCodes.has(code)) {
    return Promise.resolve();
  }

  const existing = exchangeInFlight.get(code);
  if (existing) {
    return existing;
  }

  const request = exchangeOAuthCode(code).then(() => {
    exchangedCodes.add(code);
  });

  exchangeInFlight.set(code, request);
  request.finally(() => {
    exchangeInFlight.delete(code);
  });

  return request;
}

export default function OAuthGoogleCallback() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exchangeOAuthCode } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const code = searchParams.get('code');
  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get('returnTo')),
    [searchParams],
  );
  const oauthError = searchParams.get('error');

  useEffect(() => {
    if (oauthError === 'oauth_invalid_state') {
      setError(t('oauthStateInvalidOrExpired'));
      return;
    }
    if (oauthError === 'oauth_exchange_invalid') {
      setError(t('oauthCodeInvalidOrExpired'));
      return;
    }
    if (oauthError === 'oauth_identity_conflict') {
      setError(t('oauthIdentityConflictGoogle'));
      return;
    }
    if (oauthError) {
      setError(t('googleLoginFailed'));
      return;
    }

    if (!code) {
      setError(t('oauthMissingCode'));
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        await exchangeOnce(code, exchangeOAuthCode);
        if (!cancelled) {
          navigate(returnTo, { replace: true });
        }
      } catch {
        if (!cancelled && !exchangedCodes.has(code)) {
          setError(t('oauthCompleteFailure', { provider: 'Google' }));
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, oauthError, exchangeOAuthCode, navigate, returnTo, t]);

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <Stack gap="md">
          <Title order={2}>{t('googleLoginTitle')}</Title>
          {error ? (
            <Alert color="red">{error}</Alert>
          ) : (
            <>
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                {t('completingGoogleSignIn')}
              </Text>
            </>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
