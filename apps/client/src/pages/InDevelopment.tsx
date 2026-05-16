import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function InDevelopment() {
  const { t } = useTranslation('common');

  return (
    <Group justify="center" py="xl">
      <Card withBorder radius="lg" p="xl" maw={720} className="bg-white">
        <Stack align="center" gap="md">
          <Title order={2}>{t('inDevelopmentTitle')}</Title>
          <Text c="dimmed" ta="center">
            {t('inDevelopmentText')}
          </Text>
          <Button component={RouterLink} to="/profiles" color="brand.7">
            {t('backToProfiles')}
          </Button>
        </Stack>
      </Card>
    </Group>
  );
}
