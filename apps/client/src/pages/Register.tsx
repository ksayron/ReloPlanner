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

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(email, password);
      navigate('/wizard');
    } catch {
      setError('Registration failed');
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
