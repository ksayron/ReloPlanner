import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';
import type { RelocationCase } from '@reloplanner/shared-contracts';
import { useTranslation } from 'react-i18next';
import { assignCaseToSelf, listCases } from '../api/cases';
import { useAuth } from '@reloplanner/shared-frontend';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED: 'indigo',
  IN_PROGRESS: 'blue',
  NEEDS_USER_INPUT: 'orange',
  CANCELED: 'red',
  COMPLETED: 'teal',
};

const statusLabelKey: Record<string, string> = {
  DRAFT: 'statusDraft',
  SUBMITTED: 'statusSubmitted',
  IN_PROGRESS: 'statusInProgress',
  NEEDS_USER_INPUT: 'statusNeedsUserInput',
  CANCELED: 'statusCanceled',
  COMPLETED: 'statusCompleted',
};

export default function Cases() {
  const { t } = useTranslation(['cases', 'common']);
  const { language } = useAppLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState<RelocationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCaseId, setBusyCaseId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCases());
    } catch {
      setError(t('failedLoad', { ns: 'cases' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAssignToMe = async (caseId: string) => {
    setBusyCaseId(caseId);
    setError(null);
    try {
      await assignCaseToSelf(caseId);
      await load();
    } catch {
      setError(t('failedAssignToMe', { ns: 'cases' }));
    } finally {
      setBusyCaseId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Title order={2}>
        {user?.role === 'SPECIALIST'
          ? t('specialistTitle', { ns: 'cases' })
          : t('adminTitle', { ns: 'cases' })}
      </Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      {items.length === 0 ? <Text c="dimmed">{t('empty', { ns: 'cases' })}</Text> : null}
      {items.map((item) => (
        <Card key={item.id} withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>{item.title}</Text>
              <Badge color={statusColor[item.status] ?? 'gray'} variant="light">
                {t(statusLabelKey[item.status] ?? 'unknown', { ns: 'common' })}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {t('owner', { ns: 'cases' })}: {item.owner.displayName || item.owner.email}
            </Text>
            <Text size="sm" c="dimmed">
              {t('profile', { ns: 'cases' })}: {item.profile?.desiredRole || t('na', { ns: 'common' })}{' '}
              {'->'} {item.profile?.targetCountry || t('na', { ns: 'common' })}
              {item.profile?.targetCity ? `, ${item.profile.targetCity}` : ''}
            </Text>
            <Text size="sm" c="dimmed">
              {t('specialist', { ns: 'cases' })}:{' '}
              {item.specialist?.displayName || item.specialist?.email || t('notAssigned', { ns: 'common' })}
            </Text>
            <Group justify="space-between">
              <Group gap="sm">
                {typeof item.unreadCount === 'number' && item.unreadCount > 0 ? (
                  <Badge color="red">{t('unread', { ns: 'cases', count: item.unreadCount })}</Badge>
                ) : null}
                <Text size="sm" c="dimmed">
                  {t('updated', { ns: 'cases' })}: {new Date(item.updatedAt).toLocaleString(language)}
                </Text>
              </Group>
              <Button
                component={RouterLink}
                to={`/cases/${item.id}`}
                color="brand.7"
                variant="light"
              >
                {t('openWorkspace', { ns: 'cases' })}
              </Button>
              {user?.role === 'SPECIALIST' && !item.specialist ? (
                <Button
                  color="teal"
                  variant="light"
                  onClick={() => void handleAssignToMe(item.id)}
                  loading={busyCaseId === item.id}
                >
                  {t('assignToMe', { ns: 'cases' })}
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
