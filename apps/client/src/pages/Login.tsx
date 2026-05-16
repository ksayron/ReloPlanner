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
import { useAuth } from '../api/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation(['auth', 'common']);
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
      return t('accountBlocked', { ns: 'auth' });
    }
    if (reason === 'session_expired') {
      return t('sessionExpired', { ns: 'auth' });
    }
    return '';
  }, [location.search, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/wizard');
    } catch {
      setError(t('invalidCredentials', { ns: 'auth' }));
    }
  };

  const handleGithubLogin = () => {
    const params = new URLSearchParams({ returnTo: '/wizard' });
    window.location.assign(`/api/auth/github?${params.toString()}`);
  };

  const handleGoogleLogin = () => {
    const params = new URLSearchParams({ returnTo: '/wizard' });
    window.location.assign(`/api/auth/google?${params.toString()}`);
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>{t('login', { ns: 'auth' })}</Title>
            {lockoutMessage && <Alert color="orange">{lockoutMessage}</Alert>}
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label={t('email', { ns: 'auth' })}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label={t('password', { ns: 'auth' })}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              {t('login', { ns: 'auth' })}
            </Button>
            <Divider label={t('or', { ns: 'common' })} labelPosition="center" />
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGoogleLogin}
              fullWidth
            >
              {t('googleLogin', { ns: 'auth' })}
            </Button>
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGithubLogin}
              fullWidth
            >
              {t('githubLogin', { ns: 'auth' })}
            </Button>
            <Anchor
              component={RouterLink}
              to="/register"
              ta="center"
              c="dimmed"
              size="sm"
            >
              {t('noAccountRegister', { ns: 'auth' })}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
