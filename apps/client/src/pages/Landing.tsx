import { Link as RouterLink } from 'react-router-dom';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../api/AuthContext';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <Paper radius="lg" p="xl" className="bg-white shadow-sm">
        <Stack align="center" gap="lg">
          <Title order={1} c="brand.8">ReloPlanner</Title>
          <Text ta="center" c="dimmed" maw={680}>
            Plan your international relocation with data-driven IT job market analysis.
            Get a personalized preparation roadmap based on your skills and target market.
          </Text>
          {user ? (
            <Button component={RouterLink} to="/wizard" size="md" color="brand.7">
              Create Profile
            </Button>
          ) : (
            <Group>
              <Button component={RouterLink} to="/register" color="brand.7">
                Get Started
              </Button>
              <Button component={RouterLink} to="/login" variant="outline" color="brand.7">
                Login
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
