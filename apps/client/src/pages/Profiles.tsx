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
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
import client from '../api/client';
import ProfileComparisonModal from '../components/ProfileComparisonModal';

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
  const { t } = useTranslation(['layout', 'common']);
  const { language } = useAppLanguage();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comparisonOpened, setComparisonOpened] = useState(false);

  useEffect(() => {
    client
      .get('/profiles')
      .then((res) => setProfiles(res.data))
      .catch(() => setError(t('failedToLoadProfiles', { ns: 'common' })))
      .finally(() => setLoading(false));
  }, [t]);

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
        <Title order={2}>{t('myProfiles', { ns: 'layout' })}</Title>
        <Group>
          <Button
            variant="light"
            color="brand.1"
            onClick={() => setComparisonOpened(true)}
            disabled={profiles.length < 2}
          >
            Compare profiles
          </Button>
          <Button component={RouterLink} to="/wizard" color="brand.7">
            + {t('newProfile', { ns: 'layout' })}
          </Button>
        </Group>
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {profiles.length === 0 && !error && (
        <Paper withBorder radius="lg" p="xl" className="bg-white text-center">
          <Stack align="center">
            <Text c="dimmed">{t('youHaveNoProfiles', { ns: 'common' })}</Text>
            <Button component={RouterLink} to="/wizard" color="brand.7">
              {t('createFirstProfile', { ns: 'common' })}
            </Button>
          </Stack>
        </Paper>
      )}

      {profiles.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              withBorder
              radius="lg"
              padding="lg"
              className="bg-white transition-shadow hover:shadow-md"
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Text fw={700}>{profile.desiredRole}</Text>
                  <Badge variant="light" color="brand.1">{profile.yearsExperience} {t('yearsShort', { ns: 'common' })}</Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {(COUNTRY_NAMES[profile.currentCountry] || profile.currentCountry)}
                  {' -> '}
                  {(COUNTRY_NAMES[profile.targetCountry] || profile.targetCountry)}
                  {profile.targetCity ? `, ${profile.targetCity}` : ''}
                </Text>
                <Text size="xs" c="dimmed">{t('createdAt', { ns: 'common' })}: {new Date(profile.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US')}</Text>
                <Group gap="xs" pt="xs">
                  <Button
                    component={RouterLink}
                    to={`/dashboard/${profile.id}`}
                    size="xs"
                    color="brand.7"
                  >
                    {t('openDashboard', { ns: 'common' })}
                  </Button>
                  <Button
                    component={RouterLink}
                    to={`/wizard/${profile.id}`}
                    size="xs"
                    variant="light"
                    color="brand.1"
                  >
                    {t('editProfile', { ns: 'common' })}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <ProfileComparisonModal
        opened={comparisonOpened}
        onClose={() => setComparisonOpened(false)}
        profiles={profiles.map((profile) => ({
          id: profile.id,
          desiredRole: profile.desiredRole,
          targetCountry: profile.targetCountry,
          targetCity: profile.targetCity,
        }))}
      />
    </Stack>
  );
}
