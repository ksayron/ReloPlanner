import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import type { CaseChatSummary } from '@reloplanner/shared-contracts';
import { useTranslation } from 'react-i18next';
import { listCaseChats } from '../api/cases';
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

export default function Chats() {
  const { t } = useTranslation(['chats', 'common']);
  const { language } = useAppLanguage();
  const [items, setItems] = useState<CaseChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCaseChats());
    } catch {
      setError(t('failedLoad', { ns: 'chats' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Title order={2}>{t('title', { ns: 'chats' })}</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      {items.length === 0 ? <Text c="dimmed">{t('empty', { ns: 'chats' })}</Text> : null}
      {items.map((item) => (
        <Card key={item.caseId} withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>{item.caseTitle}</Text>
              <Badge color={statusColor[item.caseStatus] ?? 'gray'} variant="light">
                {t(statusLabelKey[item.caseStatus] ?? 'unknown', { ns: 'common' })}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {t('client', { ns: 'chats' })}: {item.clientName}
            </Text>
            <Text size="sm" c="dimmed">
              {t('specialist', { ns: 'chats' })}:{' '}
              {item.specialistName || t('notAssigned', { ns: 'common' })}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {item.lastMessage
                ? `${item.lastMessage.senderName}: ${item.lastMessage.body}`
                : t('noMessagesYet', { ns: 'chats' })}
            </Text>
            <Group justify="space-between">
              <Group gap="sm">
                {item.unreadCount > 0 ? (
                  <Badge color="red">{t('unread', { ns: 'chats', count: item.unreadCount })}</Badge>
                ) : null}
                <Text size="sm" c="dimmed">
                  {t('updated', { ns: 'chats' })}:{' '}
                  {new Date(item.lastActivityAt).toLocaleString(language)}
                </Text>
              </Group>
              <Group gap="sm">
                <Button component={RouterLink} to={`/cases/${item.caseId}`} variant="subtle" color="gray">
                  {t('openCase', { ns: 'chats' })}
                </Button>
                <Button component={RouterLink} to={`/chats/${item.caseId}`} color="brand.7" variant="light">
                  {t('openChat', { ns: 'chats' })}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
