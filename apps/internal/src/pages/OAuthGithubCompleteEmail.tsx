import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/AuthContext';

function normalizeReturnTo(value: string | null) {
  if (!value) return '/sync';
  if (!value.startsWith('/')) return '/sync';
  if (value.startsWith('//')) return '/sync';
  return value;
}

export default function OAuthGithubCompleteEmail() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuthEmail, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ticket = searchParams.get('ticket');
  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get('returnTo')),
    [searchParams],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ticket) {
      setError(t('missingTicket'));
      return;
    }

    try {
      const completed = await completeOAuthEmail(ticket, email);
      const params = new URLSearchParams({
        code: completed.exchangeCode,
        returnTo: completed.returnTo || returnTo,
      });
      navigate(`/oauth/github/callback?${params.toString()}`, {
        replace: true,
      });
    } catch (err: unknown) {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message === 'string'
          ? (err as { response?: { data?: { message?: string } } }).response!
              .data!.message!
          : t('unableToCompleteGithubWithEmail');
      setError(message);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Title order={2}>{t('completeGithubLogin')}</Title>
            <Text size="sm" c="dimmed">
              {t('githubNoEmailExplanation')}
            </Text>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label={t('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              {t('continue')}
            </Button>
            <Anchor href="/login" size="sm" ta="center" c="dimmed">
              {t('backToLogin')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
