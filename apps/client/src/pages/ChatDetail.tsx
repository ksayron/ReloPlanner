import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CaseMessage, CaseReadState, RelocationCase } from '@reloplanner/shared-contracts';
import { useAuth, useRealtimeCase } from '@reloplanner/shared-frontend';
import {
  getCase,
  getCaseReadState,
  listCaseMessages,
  markCaseRead,
  postCaseMessage,
} from '../api/cases';
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

const formatMessageKind = (kind: string, t: (key: string) => string) => {
  const keyMap: Record<string, string> = {
    SYSTEM: 'kindSystem',
    SPECIALIST: 'kindSpecialist',
    CLIENT: 'kindClient',
  };
  const key = keyMap[kind];
  return key ? t(key) : kind;
};

export default function ChatDetail() {
  const { t } = useTranslation(['chats', 'common']);
  const { language } = useAppLanguage();
  const { caseId = '' } = useParams();
  const { token, user } = useAuth();
  const [item, setItem] = useState<RelocationCase | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [readStates, setReadStates] = useState<CaseReadState[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertMessage = useCallback((incoming: CaseMessage) => {
    setMessages((current) => {
      const index = current.findIndex((row) => row.id === incoming.id);
      if (index >= 0) {
        const copy = [...current];
        copy[index] = incoming;
        return copy;
      }
      return [...current, incoming];
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseData, messageData, readData] = await Promise.all([
        getCase(caseId),
        listCaseMessages(caseId),
        getCaseReadState(caseId),
      ]);
      setItem(caseData);
      setMessages(messageData);
      setReadStates(readData);
    } catch {
      setError(t('chats:failedLoadCaseChat'));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeCase({
    token,
    caseId,
    onCaseMessageCreated: ({ data }) => {
      upsertMessage(data);
      if (data.author?.id && data.author.id !== user?.id) {
        setReadStates((current) =>
          current.map((row) =>
            row.user.id === user?.id
              ? {
                  ...row,
                  unreadCount: row.unreadCount + 1,
                  updatedAt: new Date().toISOString(),
                }
              : row,
          ),
        );
      }
    },
    onCaseMessageRead: ({ data }) => {
      setReadStates((current) => {
        const index = current.findIndex((row) => row.user.id === data.userId);
        if (index < 0) return current;
        const copy = [...current];
        copy[index] = {
          ...copy[index],
          lastReadMessageId: data.lastReadMessageId,
          lastReadAt: data.lastReadAt,
          unreadCount: data.unreadCount,
          updatedAt: new Date().toISOString(),
        };
        return copy;
      });
    },
    onCaseSystemCreated: ({ data, at }) => {
      upsertMessage(data);
      const nextStatusRaw =
        data.metadata && typeof data.metadata.statusTo === 'string'
          ? data.metadata.statusTo
          : null;
      if (!nextStatusRaw) return;
      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          status: nextStatusRaw as RelocationCase['status'],
          updatedAt: at,
        };
      });
    },
  });

  const currentReadState = useMemo(
    () => readStates.find((row) => row.user.id === user?.id) ?? null,
    [readStates, user?.id],
  );

  useEffect(() => {
    if (!caseId) return;
    if (!currentReadState || currentReadState.unreadCount <= 0) return;
    void markCaseRead(caseId).catch(() => {
      // Non-blocking.
    });
  }, [caseId, currentReadState]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      await postCaseMessage(caseId, content);
      setText('');
      await markCaseRead(caseId);
    } catch {
      setError(t('chats:failedSend'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  if (!item) {
    return (
      <Stack>
        <Alert color="red">{t('chats:caseNotFound')}</Alert>
        <Button component={RouterLink} to="/chats" variant="light">
          {t('chats:backToChats')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      {error ? <Alert color="red">{error}</Alert> : null}
      <Group justify="space-between" align="start">
        <Stack gap={2}>
          <Button component={RouterLink} to="/chats" variant="subtle" color="gray">
            {t('chats:backToChats')}
          </Button>
          <Title order={2}>{item.title}</Title>
          <Text c="dimmed">
            {t('chats:specialist')}:{' '}
            {item.specialist?.displayName || item.specialist?.email || t('chats:notAssigned')}
          </Text>
        </Stack>
        <Group>
          <Badge color={statusColor[item.status] ?? 'gray'} variant="light" size="lg">
            {formatCaseStatus(item.status, (key) => t(`common:${key}`))}
          </Badge>
          <Button component={RouterLink} to={`/cases/${item.id}`} variant="light" color="gray">
            {t('chats:openCaseDetails')}
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="sm">
          <Title order={4}>{t('chats:caseChat')}</Title>
          <Group align="end">
            <TextInput
              className="flex-1"
              label={t('chats:reply')}
              placeholder={t('chats:replyPlaceholder')}
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && text.trim() && !busy) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button onClick={() => void handleSend()} disabled={busy || !text.trim()} color="brand.7">
              {t('chats:send')}
            </Button>
          </Group>
          <ScrollArea h={520} type="always" scrollbarSize={8} offsetScrollbars>
            {messages.length === 0 ? <Text c="dimmed">{t('chats:noMessagesYet')}</Text> : null}
            {[...messages].reverse().map((message) => (
              <Card
                key={message.id}
                withBorder
                radius="md"
                p="sm"
                className={message.kind === 'SYSTEM' ? 'bg-[var(--mantine-color-gray-0)]' : 'bg-white'}
              >
                <Stack gap={2}>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge
                        color={message.kind === 'SYSTEM' ? 'dark' : message.kind === 'SPECIALIST' ? 'indigo' : 'brand.7'}
                        variant="light"
                      >
                        {formatMessageKind(message.kind, (key) => t(`chats:${key}`))}
                      </Badge>
                      <Text size="sm" fw={600}>
                        {message.author?.displayName || message.author?.email || t('chats:system')}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {new Date(message.createdAt).toLocaleString(language)}
                    </Text>
                  </Group>
                  <Text>{message.content}</Text>
                </Stack>
              </Card>
            ))}
          </ScrollArea>
        </Stack>
      </Card>
    </Stack>
  );
}
