import { Link as RouterLink } from 'react-router-dom';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../api/AuthContext';
import { useTranslation } from 'react-i18next';

export default function Landing() {
  const { t } = useTranslation(['landing', 'layout']);
  const { user } = useAuth();

  return (
    <div className="mx-auto mt-12 max-w-3xl">
      <Paper radius="lg" p="xl" className="bg-white shadow-sm">
        <Stack align="center" gap="lg">
          <Title order={1} c="brand.8">{t('appTitle', { ns: 'layout' })}</Title>
          <Text ta="center" c="dimmed" maw={680}>
            {t('subtitle', { ns: 'landing' })} {t('subtitle2', { ns: 'landing' })}
          </Text>
          {user ? (
            <Button component={RouterLink} to="/wizard" size="md" color="brand.7">
              {t('createProfile', { ns: 'landing' })}
            </Button>
          ) : (
            <Group>
              <Button component={RouterLink} to="/register" color="brand.7">
                {t('getStarted', { ns: 'landing' })}
              </Button>
              <Button component={RouterLink} to="/login" variant="outline" color="brand.7">
                {t('login', { ns: 'layout' })}
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
