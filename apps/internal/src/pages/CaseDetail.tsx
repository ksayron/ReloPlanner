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
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type {
  CaseMessage,
  CaseReadState,
  RelocationCase,
  Role,
} from '@reloplanner/shared-contracts';
import { useAuth, useRealtimeCase } from '@reloplanner/shared-frontend';
import {
  archiveCase,
  completeCase,
  assignCaseToSelf,
  assignSpecialist,
  getCase,
  getCaseReadState,
  listCaseMessages,
  markCaseRead,
  postCaseMessage,
  reassignSpecialist,
  unarchiveCase,
} from '../api/cases';
import client from '../api/client';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

interface SpecialistOption {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
}

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

export default function CaseDetail() {
  const { t } = useTranslation(['caseDetail', 'chats', 'common']);
  const { language } = useAppLanguage();
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [item, setItem] = useState<RelocationCase | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [readStates, setReadStates] = useState<CaseReadState[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);
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
      setSelectedSpecialist(caseData.specialist?.id ?? null);
    } catch {
      setError(t('failedLoad', { ns: 'caseDetail' }));
    } finally {
      setLoading(false);
    }
  }, [caseId, t]);

  const loadSpecialists = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    try {
      const res = await client.get<SpecialistOption[]>('/admin/users', {
        params: { role: 'SPECIALIST' },
      });
      setSpecialists(res.data);
    } catch {
      setSpecialists([]);
    }
  }, [user?.role]);

  useEffect(() => {
    void loadAll();
    void loadSpecialists();
  }, [loadAll, loadSpecialists]);

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

  const currentReadState = useMemo(
    () => readStates.find((row) => row.user.id === user?.id) ?? null,
    [readStates, user?.id],
  );
  const canSend =
    user?.role !== 'SPECIALIST' || item?.specialist?.id === user?.id;
  const canComplete =
    item &&
    item.status !== 'COMPLETED' &&
    item.status !== 'CANCELED' &&
    item.status !== 'DRAFT' &&
    (user?.role === 'ADMIN' ||
      (user?.role === 'SPECIALIST' && item.specialist?.id === user.id));

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
      setError(t('failedSend', { ns: 'caseDetail' }));
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedSpecialist || !item) return;
    setBusy(true);
    try {
      if (item.specialist) {
        await reassignSpecialist(caseId, selectedSpecialist);
      } else {
        await assignSpecialist(caseId, selectedSpecialist);
      }
      await loadAll();
    } catch {
      setError(t('failedApplyAssignment', { ns: 'caseDetail' }));
    } finally {
      setBusy(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await assignCaseToSelf(caseId);
      await loadAll();
    } catch {
      setError(t('failedAssignToMe', { ns: 'caseDetail' }));
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!item || user?.role !== 'SPECIALIST') return;
    setBusy(true);
    setError(null);
    try {
      if (item.isArchivedForCurrentUser) {
        await unarchiveCase(caseId);
        await loadAll();
      } else {
        await archiveCase(caseId);
        navigate('/cases');
      }
    } catch {
      setError(t('failedArchiveState', { ns: 'caseDetail' }));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeCase(caseId);
      await loadAll();
    } catch {
      setError(t('failedComplete', { ns: 'caseDetail' }));
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
        <Alert color="red">{t('caseNotFound', { ns: 'caseDetail' })}</Alert>
        <Button component={RouterLink} to="/cases" variant="light">
          {t('backToQueue', { ns: 'caseDetail' })}
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
            {t('backToQueue', { ns: 'caseDetail' })}
          </Button>
          <Title order={2}>{item.title}</Title>
          <Text c="dimmed">
            {item.profile
              ? `${t('profile', { ns: 'caseDetail' })}: ${item.profile.desiredRole} -> ${item.profile.targetCountry}${item.profile.targetCity ? `, ${item.profile.targetCity}` : ''}`
              : t('noProfileAttached', { ns: 'caseDetail' })}
          </Text>
          {item.additionalNotes ? (
            <Text c="dimmed">
              {t('notes', { ns: 'caseDetail' })}: {item.additionalNotes}
            </Text>
          ) : null}
        </Stack>
        <Badge color={statusColor[item.status] ?? 'gray'} variant="light" size="lg">
          {t(statusLabelKey[item.status] ?? 'unknown', { ns: 'common' })}
        </Badge>
      </Group>

      <Card withBorder radius="lg" p="md" className="bg-white">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('owner', { ns: 'caseDetail' })}: {item.owner.displayName || item.owner.email}
          </Text>
          <Text size="sm" c="dimmed">
            {t('assignedSpecialist', { ns: 'caseDetail' })}:{' '}
            {item.specialist?.displayName || item.specialist?.email || t('notAssigned', { ns: 'common' })}
          </Text>
          {user?.role === 'ADMIN' ? (
            <Group align="end">
              <Select
                className="min-w-[300px] flex-1"
                label={t('assignSpecialist', { ns: 'caseDetail' })}
                data={specialists.map((specialist) => ({
                  value: specialist.id,
                  label: specialist.displayName
                    ? `${specialist.displayName} (${specialist.email})`
                    : specialist.email,
                }))}
                value={selectedSpecialist}
                onChange={setSelectedSpecialist}
                placeholder={t('selectSpecialist', { ns: 'caseDetail' })}
              />
              <Button
                color="brand.7"
                variant="light"
                disabled={!selectedSpecialist || busy}
                onClick={() => void handleAssign()}
              >
                {item.specialist
                  ? t('reassign', { ns: 'caseDetail' })
                  : t('assign', { ns: 'caseDetail' })}
              </Button>
            </Group>
          ) : null}
          {user?.role === 'SPECIALIST' && !item.specialist ? (
            <Group>
              <Button color="teal" variant="light" onClick={() => void handleAssignToMe()} loading={busy}>
                {t('assignToMe', { ns: 'caseDetail' })}
              </Button>
            </Group>
          ) : null}
          {currentReadState ? (
            <Badge color={currentReadState.unreadCount > 0 ? 'red' : 'teal'} w="fit-content">
              {t('unreadForMe', { ns: 'caseDetail', count: currentReadState.unreadCount })}
            </Badge>
          ) : null}
          <Group>
            {user?.role === 'SPECIALIST' ? (
              <Button
                color="gray"
                variant="light"
                onClick={() => void handleArchiveToggle()}
                disabled={busy}
              >
                {item.isArchivedForCurrentUser
                  ? t('unarchiveForMe', { ns: 'caseDetail' })
                  : t('archiveForMe', { ns: 'caseDetail' })}
              </Button>
            ) : null}
            <Button
              color="teal"
              variant="light"
              disabled={!canComplete || busy}
              onClick={() => void handleComplete()}
            >
              {t('complete', { ns: 'caseDetail' })}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="sm">
          <Title order={4}>{t('caseChat', { ns: 'caseDetail' })}</Title>
          <ScrollArea h={440} type="always" scrollbarSize={8} offsetScrollbars>
            {messages.length === 0 ? <Text c="dimmed">{t('noMessagesYet', { ns: 'caseDetail' })}</Text> : null}
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
                        {message.kind === 'SYSTEM'
                          ? t('roleSystem', { ns: 'common' })
                          : message.kind === 'SPECIALIST'
                            ? t('roleSpecialist', { ns: 'common' })
                            : t('roleClient', { ns: 'common' })}
                      </Badge>
                      <Text size="sm" fw={600}>
                        {message.author?.displayName || message.author?.email || t('roleSystem', { ns: 'common' })}
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
              label={t('replyToCase', { ns: 'caseDetail' })}
              placeholder={t('replyToCasePlaceholder', { ns: 'caseDetail' })}
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && text.trim() && !busy && canSend) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              onClick={() => void handleSend()}
              disabled={busy || !text.trim() || !canSend}
              color="brand.7"
            >
              {t('send', { ns: 'caseDetail' })}
            </Button>
          </Group>
          {!canSend ? (
            <Text size="sm" c="dimmed">
              {t('assignToSelfBeforeMessage', { ns: 'caseDetail' })}
            </Text>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  );
}
