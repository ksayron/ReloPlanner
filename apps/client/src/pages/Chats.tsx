import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CaseChatSummary } from '@reloplanner/shared-contracts';
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

const formatCaseStatus = (status: string, t: (key: string) => string) => {
  const keyMap: Record<string, string> = {
    DRAFT: 'statusDraft',
    SUBMITTED: 'statusSubmitted',
    IN_PROGRESS: 'statusInProgress',
    NEEDS_USER_INPUT: 'statusNeedsUserInput',
    CANCELED: 'statusCanceled',
    COMPLETED: 'statusCompleted',
  };
  const key = keyMap[status];
  return key ? t(key) : status.replaceAll('_', ' ');
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
      setError(t('chats:failedLoad'));
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
      <Title order={2}>{t('chats:title')}</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      {items.length === 0 ? <Text c="dimmed">{t('chats:noChats')}</Text> : null}
      {items.map((item) => (
        <Card key={item.caseId} withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>{item.caseTitle}</Text>
              <Badge color={statusColor[item.caseStatus] ?? 'gray'} variant="light">
                {formatCaseStatus(item.caseStatus, (key) => t(`common:${key}`))}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              {t('chats:specialist')}: {item.specialistName || t('chats:notAssigned')}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {item.lastMessage
                ? `${item.lastMessage.senderName}: ${item.lastMessage.body}`
                : t('chats:noMessagesYet')}
            </Text>
            <Group justify="space-between">
              <Group gap="sm">
                {item.unreadCount > 0 ? (
                  <Badge color="red">{t('cases:unread', { count: item.unreadCount, ns: 'cases' })}</Badge>
                ) : null}
                <Text size="sm" c="dimmed">
                  {t('chats:updated')}: {new Date(item.lastActivityAt).toLocaleString(language)}
                </Text>
              </Group>
              <Group gap="sm">
                <Button component={RouterLink} to={`/cases/${item.caseId}`} variant="subtle" color="gray">
                  {t('chats:openCase')}
                </Button>
                <Button component={RouterLink} to={`/chats/${item.caseId}`} color="brand.7" variant="light">
                  {t('chats:openChat')}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
