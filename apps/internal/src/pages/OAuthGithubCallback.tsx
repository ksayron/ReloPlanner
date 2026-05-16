import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/AuthContext';

const exchangedCodes = new Set<string>();
const exchangeInFlight = new Map<string, Promise<void>>();

function normalizeReturnTo(value: string | null) {
  if (!value) return '/sync';
  if (!value.startsWith('/')) return '/sync';
  if (value.startsWith('//')) return '/sync';
  return value;
}

function humanizeOAuthError(code: string | null, t: (key: string) => string) {
  if (!code) return null;
  if (code === 'oauth_invalid_state') {
    return t('oauthStateInvalidOrExpired');
  }
  if (code === 'oauth_exchange_invalid') {
    return t('oauthCodeInvalidOrExpired');
  }
  if (code === 'oauth_identity_conflict') {
    return t('oauthIdentityConflictGithub');
  }
  return t('githubLoginFailed');
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

export default function OAuthGithubCallback() {
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
    const mappedError = humanizeOAuthError(oauthError, t);
    if (mappedError) {
      setError(mappedError);
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
          setError(t('oauthCompleteFailure', { provider: 'GitHub' }));
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
          <Title order={2}>{t('githubLoginTitle')}</Title>
          {error ? (
            <Alert color="red">{error}</Alert>
          ) : (
            <>
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                {t('completingGithubSignIn')}
              </Text>
            </>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
