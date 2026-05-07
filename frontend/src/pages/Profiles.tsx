import { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import client from '../api/client';

interface ProfileSummary {
  id: string;
  currentCountry: string;
  targetCountry: string;
  targetCity: string | null;
  desiredRole: string;
  yearsExperience: number;
  createdAt: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany',
  PL: 'Poland',
  CA: 'Canada',
  UA: 'Ukraine',
  US: 'United States',
  GB: 'United Kingdom',
  NL: 'Netherlands',
  FR: 'France',
  ES: 'Spain',
  CZ: 'Czech Republic',
};

export default function Profiles() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/profiles')
      .then((res) => setProfiles(res.data))
      .catch(() => setError('Failed to load profiles'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>My Profiles</Title>
        <Button component={RouterLink} to="/wizard" color="brand.7">+ New Profile</Button>
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {profiles.length === 0 && !error && (
        <Paper withBorder radius="lg" p="xl" className="bg-white text-center">
          <Stack align="center">
            <Text c="dimmed">You haven't created any profiles yet.</Text>
            <Button component={RouterLink} to="/wizard" color="brand.7">
              Create Your First Profile
            </Button>
          </Stack>
        </Paper>
      )}

      {profiles.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              component={RouterLink}
              to={`/dashboard/${profile.id}`}
              withBorder
              radius="lg"
              padding="lg"
              className="bg-white no-underline transition-shadow hover:shadow-md"
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Text fw={700}>{profile.desiredRole}</Text>
                  <Badge variant="light" color="brand.1">{profile.yearsExperience} yrs</Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {(COUNTRY_NAMES[profile.currentCountry] || profile.currentCountry)}
                  {' -> '}
                  {(COUNTRY_NAMES[profile.targetCountry] || profile.targetCountry)}
                  {profile.targetCity ? `, ${profile.targetCity}` : ''}
                </Text>
                <Text size="xs" c="dimmed">Created: {new Date(profile.createdAt).toLocaleDateString()}</Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
