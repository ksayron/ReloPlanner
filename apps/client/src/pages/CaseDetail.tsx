import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
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
  archiveCase,
  cancelCase,
  completeCase,
  deleteCaseForCurrentUser,
  getCase,
  getCaseReadState,
  listCaseMessages,
  markCaseRead,
  postCaseMessage,
  submitCase,
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

export default function CaseDetail() {
  const { t } = useTranslation(['caseDetail', 'common']);
  const { language } = useAppLanguage();
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [item, setItem] = useState<RelocationCase | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [readStates, setReadStates] = useState<CaseReadState[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  const loadAll = useCallback(async () => {
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
      setError(t('caseDetail:failedLoad'));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCaseMessageCreated = useCallback(
    ({ data }: { data: CaseMessage }) => {
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
    [upsertMessage, user?.id],
  );

  const handleCaseMessageRead = useCallback(
    ({
      data,
    }: {
      data: {
        userId: string;
        lastReadMessageId: string | null;
        lastReadAt: string | null;
        unreadCount: number;
      };
    }) => {
      setReadStates((current) => {
        const index = current.findIndex((row) => row.user.id === data.userId);
        if (index >= 0) {
          const copy = [...current];
          copy[index] = {
            ...copy[index],
            lastReadMessageId: data.lastReadMessageId,
            lastReadAt: data.lastReadAt,
            unreadCount: data.unreadCount,
            updatedAt: new Date().toISOString(),
          };
          return copy;
        }
        return current;
      });
    },
    [],
  );

  const handleCaseSystemCreated = useCallback(
    ({ data, at }: { data: CaseMessage; at: string }) => {
      upsertMessage(data);
      const nextStatusRaw =
        data.metadata && typeof data.metadata.statusTo === 'string'
          ? data.metadata.statusTo
          : null;
      if (nextStatusRaw) {
        setItem((current) => {
          if (!current) return current;
          return {
            ...current,
            status: nextStatusRaw as RelocationCase['status'],
            updatedAt: at,
          };
        });
      }
    },
    [upsertMessage],
  );

  useRealtimeCase({
    token,
    caseId,
    onCaseMessageCreated: handleCaseMessageCreated,
    onCaseMessageRead: handleCaseMessageRead,
    onCaseSystemCreated: handleCaseSystemCreated,
  });

  const canSubmit = item?.status === 'DRAFT' || item?.status === 'NEEDS_USER_INPUT';
  const canCancel = item?.status !== 'CANCELED' && item?.status !== 'COMPLETED';
  const canComplete =
    item?.status !== 'COMPLETED' &&
    item?.status !== 'CANCELED' &&
    item?.status !== 'DRAFT';

  const currentReadState = useMemo(
    () => readStates.find((row) => row.user.id === user?.id) ?? null,
    [readStates, user?.id],
  );

  useEffect(() => {
    if (!caseId) return;
    if (!currentReadState || currentReadState.unreadCount <= 0) return;
    void markCaseRead(caseId)
      .then((payload) => {
        setReadStates((current) =>
          current.map((row) =>
            row.user.id === user?.id
              ? {
                  ...row,
                  lastReadMessageId: payload.lastReadMessageId,
                  lastReadAt: payload.lastReadAt,
                  unreadCount: payload.unreadCount,
                  updatedAt: new Date().toISOString(),
                }
              : row,
          ),
        );
      })
      .catch(() => {
        // Keep non-blocking; full reload remains available.
      });
  }, [caseId, currentReadState, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      await postCaseMessage(caseId, content);
      setText('');
      await markCaseRead(caseId);
    } catch {
      setError(t('caseDetail:failedSend'));
    } finally {
      setBusy(false);
    }
  };

  const handleStatusAction = async (action: 'submit' | 'cancel' | 'complete') => {
    setBusy(true);
    try {
      if (action === 'submit') await submitCase(caseId);
      if (action === 'cancel') await cancelCase(caseId);
      if (action === 'complete') await completeCase(caseId);
      await loadAll();
    } catch {
      setError(t('caseDetail:failedAction', { action: t(`caseDetail:action${action[0].toUpperCase()}${action.slice(1)}`) }));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await archiveCase(caseId);
      navigate('/cases');
    } catch {
      setError(t('caseDetail:failedArchive'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteCaseForCurrentUser(caseId);
      navigate('/cases');
    } catch {
      setError(t('caseDetail:failedDelete'));
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
        <Alert color="red">{t('caseDetail:caseNotFound')}</Alert>
        <Button component={RouterLink} to="/cases" variant="light">
          {t('caseDetail:backToCases')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      {error ? <Alert color="red">{error}</Alert> : null}
      <Group justify="space-between" align="start">
        <Stack gap={2}>
          <Button component={RouterLink} to="/cases" variant="subtle" color="gray">
            {t('caseDetail:backToCases')}
          </Button>
          <Title order={2}>{item.title}</Title>
          <Text c="dimmed">
            {item.profile
              ? `${t('caseDetail:profilePrefix')}: ${item.profile.desiredRole} -> ${item.profile.targetCountry}${item.profile.targetCity ? `, ${item.profile.targetCity}` : ''}`
              : t('caseDetail:noProfileAttached')}
          </Text>
          {item.additionalNotes ? (
            <Text c="dimmed">{t('caseDetail:notes')}: {item.additionalNotes}</Text>
          ) : null}
        </Stack>
        <Badge color={statusColor[item.status] ?? 'gray'} variant="light" size="lg">
          {formatCaseStatus(item.status, (key) => t(`common:${key}`))}
        </Badge>
      </Group>

      <Card withBorder radius="lg" p="md" className="bg-white">
        <Group>
          <Button
            onClick={() => void handleStatusAction('submit')}
            disabled={!canSubmit || busy}
            color="brand.7"
            variant="light"
          >
            {t('caseDetail:submit')}
          </Button>
          <Button
            onClick={() => void handleArchive()}
            color="gray"
            variant="light"
            disabled={busy}
          >
            {t('caseDetail:archive')}
          </Button>
          <Button
            onClick={() => void handleStatusAction('cancel')}
            disabled={!canCancel || busy}
            color="red"
            variant="light"
          >
            {t('caseDetail:cancel')}
          </Button>
          <Button
            onClick={() => void handleStatusAction('complete')}
            disabled={!canComplete || busy}
            color="teal"
            variant="light"
          >
            {t('caseDetail:complete')}
          </Button>
          <Button onClick={() => void handleDelete()} disabled={busy} color="red" variant="subtle">
            {t('caseDetail:deleteForMe')}
          </Button>
          {currentReadState ? (
            <Badge color={currentReadState.unreadCount > 0 ? 'red' : 'teal'}>
              {t('caseDetail:unread', { count: currentReadState.unreadCount })}
            </Badge>
          ) : null}
        </Group>
      </Card>

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="sm">
          <Title order={4}>{t('caseDetail:caseChat')}</Title>
          <ScrollArea h={420} type="always" scrollbarSize={8} offsetScrollbars>
            {messages.length === 0 ? <Text c="dimmed">{t('caseDetail:noMessagesYet')}</Text> : null}
            {messages.map((message) => (
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
                        {formatMessageKind(message.kind, (key) => t(`caseDetail:${key}`))}
                      </Badge>
                      <Text size="sm" fw={600}>
                        {message.author?.displayName || message.author?.email || t('caseDetail:system')}
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
            <div ref={messagesEndRef} />
          </ScrollArea>
          <Group align="end">
            <TextInput
              className="flex-1"
              label={t('caseDetail:newMessage')}
              placeholder={t('caseDetail:newMessagePlaceholder')}
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
              {t('caseDetail:send')}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
