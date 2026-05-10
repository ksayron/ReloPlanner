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
  TextInput,
  Title,
} from '@mantine/core';
import { useAuth } from '../api/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/wizard');
    } catch {
      setError('Invalid credentials');
    }
  };

  const handleGithubLogin = () => {
    const params = new URLSearchParams({ returnTo: '/wizard' });
    window.location.assign(`/api/auth/github?${params.toString()}`);
  };

  return (
    <div className="mx-auto mt-8 max-w-md">
      <Paper withBorder radius="lg" p="xl" className="bg-white">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>Login</Title>
            {error && <Alert color="red">{error}</Alert>}
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
              required
            />
            <Button type="submit" loading={loading} color="brand.7" fullWidth>
              Login
            </Button>
            <Divider label="or" labelPosition="center" />
            <Button
              type="button"
              variant="light"
              color="dark"
              onClick={handleGithubLogin}
              fullWidth
            >
              Continue with GitHub
            </Button>
            <Anchor
              component={RouterLink}
              to="/register"
              ta="center"
              c="dimmed"
              size="sm"
            >
              No account? Register
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </div>
  );
}
