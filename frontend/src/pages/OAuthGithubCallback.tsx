import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../api/AuthContext';

const exchangedCodes = new Set<string>();
const exchangeInFlight = new Map<string, Promise<void>>();

function normalizeReturnTo(value: string | null) {
  if (!value) return '/wizard';
  if (!value.startsWith('/')) return '/wizard';
  if (value.startsWith('//')) return '/wizard';
  return value;
}

function humanizeOAuthError(code: string | null) {
  if (!code) return null;
  if (code === 'oauth_invalid_state') {
    return 'OAuth state is invalid or expired. Please try again.';
  }
  if (code === 'oauth_exchange_invalid') {
    return 'OAuth code is invalid or expired. Please try again.';
  }
  if (code === 'oauth_identity_conflict') {
    return 'This account is linked to another GitHub identity.';
  }
  return 'GitHub login failed. Please try again.';
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
    const mappedError = humanizeOAuthError(oauthError);
    if (mappedError) {
      setError(mappedError);
      return;
    }

    if (!code) {
      setError('Missing OAuth code. Please try again.');
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
          setError('Failed to complete GitHub login. Please try again.');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [code, oauthError, exchangeOAuthCode, navigate, returnTo]);

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <Stack gap="md">
          <Title order={2}>GitHub Login</Title>
          {error ? (
            <Alert color="red">{error}</Alert>
          ) : (
            <>
              <Loader size="sm" />
              <Text c="dimmed" size="sm">
                Completing GitHub sign-in...
              </Text>
            </>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
