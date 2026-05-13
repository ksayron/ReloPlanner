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

const passwordPolicy =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export default function Register() {
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
      setError(
        'Password must be at least 8 chars and include uppercase, lowercase, number, and symbol.',
      );
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
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
          : 'Registration failed';
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
            <Title order={2}>Register</Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
              description="How specialists should refer to you."
              required
            />
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              description="Min 8 chars, uppercase, lowercase, number, special symbol."
              required
            />
            <PasswordInput
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
            />
            <Text size="xs" c="dimmed">
              Password policy: 8+ characters, at least one uppercase, one lowercase, one number,
              and one special symbol.
            </Text>
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              Register
            </Button>
            <Divider label="or" labelPosition="center" />
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGoogleRegister}
              fullWidth
            >
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGithubRegister}
              fullWidth
            >
              Continue with GitHub
            </Button>
            <Anchor
              component={RouterLink}
              to="/login"
              ta="center"
              c="dimmed"
              size="sm"
            >
              Already have an account? Login
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
