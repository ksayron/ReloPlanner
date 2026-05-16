import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Button,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useAuth } from '../api/AuthContext';
import { useTranslation } from 'react-i18next';

const passwordPolicy =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function Register() {
  const { t } = useTranslation(['auth', 'common']);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { register, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!passwordPolicy.test(password)) {
      setError(t('passwordPolicy', { ns: 'auth' }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch', { ns: 'auth' }));
      return;
    }
    try {
      await register(email, displayName, password);
      navigate('/wizard');
    } catch (err) {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message === 'string'
          ? (err as { response?: { data?: { message?: string } } }).response!
              .data!.message!
          : t('registrationFailed', { ns: 'auth' });
      setError(message);
    }
  };

  const handleGithubRegister = () => {
    const params = new URLSearchParams({ returnTo: '/wizard' });
    window.location.assign(`/api/auth/github?${params.toString()}`);
  };

  const handleGoogleRegister = () => {
    const params = new URLSearchParams({ returnTo: '/wizard' });
    window.location.assign(`/api/auth/google?${params.toString()}`);
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>{t('register', { ns: 'auth' })}</Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label={t('displayName', { ns: 'auth' })}
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
              description={t('displayNameDescription', { ns: 'auth' })}
              required
            />
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
              description={t('passwordHint', { ns: 'auth' })}
              required
            />
            <PasswordInput
              label={t('confirmPassword', { ns: 'auth' })}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
            />
            <Text size="xs" c="dimmed">
              {t('passwordPolicyShort', { ns: 'auth' })}
            </Text>
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              {t('register', { ns: 'auth' })}
            </Button>
            <Divider label={t('or', { ns: 'common' })} labelPosition="center" />
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGoogleRegister}
              fullWidth
            >
              {t('googleLogin', { ns: 'auth' })}
            </Button>
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGithubRegister}
              fullWidth
            >
              {t('githubLogin', { ns: 'auth' })}
            </Button>
            <Anchor
              component={RouterLink}
              to="/login"
              ta="center"
              c="dimmed"
              size="sm"
            >
              {t('haveAccountLogin', { ns: 'auth' })}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
