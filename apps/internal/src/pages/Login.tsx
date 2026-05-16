import { useMemo, useState } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../api/AuthContext';

export default function Login() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const lockoutMessage = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('lockout');
    if (reason === 'blocked') {
      return t('accountBlocked');
    }
    if (reason === 'session_expired') {
      return t('sessionExpired');
    }
    return '';
  }, [location.search, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/sync');
    } catch {
      setError(t('invalidCredentials'));
    }
  };

  const handleGithubLogin = () => {
    const params = new URLSearchParams({ returnTo: '/sync' });
    window.location.assign(`/api/auth/github?${params.toString()}`);
  };

  const handleGoogleLogin = () => {
    const params = new URLSearchParams({ returnTo: '/sync' });
    window.location.assign(`/api/auth/google?${params.toString()}`);
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>{t('login')}</Title>
            {lockoutMessage && <Alert color="orange">{lockoutMessage}</Alert>}
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label={t('email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t('password')}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              {t('login')}
            </Button>
            <Divider label={t('or')} labelPosition="center" />
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGoogleLogin}
              fullWidth
            >
              {t('continueWithGoogle')}
            </Button>
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGithubLogin}
              fullWidth
            >
              {t('continueWithGithub')}
            </Button>
            <Anchor
              component={RouterLink}
              to="/register"
              ta="center"
              c="dimmed"
              size="sm"
            >
              {t('noAccountRegister')}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
