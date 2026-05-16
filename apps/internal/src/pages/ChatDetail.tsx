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
  Textarea,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CaseMessage, CaseReadState, RelocationCase, SpecialistCaseNote } from '@reloplanner/shared-contracts';
import { useAuth, useRealtimeCase } from '@reloplanner/shared-frontend';
import {
  getCase,
  getCaseReadState,
  getSpecialistCaseNote,
  listCaseMessages,
  markCaseRead,
  postCaseMessage,
  updateSpecialistCaseNote,
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

const statusLabelKey: Record<string, string> = {
  DRAFT: 'statusDraft',
  SUBMITTED: 'statusSubmitted',
  IN_PROGRESS: 'statusInProgress',
  NEEDS_USER_INPUT: 'statusNeedsUserInput',
  CANCELED: 'statusCanceled',
  COMPLETED: 'statusCompleted',
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
  const [note, setNote] = useState<SpecialistCaseNote | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

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
      if (user?.role === 'SPECIALIST' || user?.role === 'ADMIN') {
        try {
          const noteData = await getSpecialistCaseNote(caseId);
          setNote(noteData);
          setNoteDraft(noteData.body);
        } catch {
          setNote(null);
          setNoteDraft('');
        }
      }
    } catch {
      setError(t('failedLoadCaseChat', { ns: 'chats' }));
    } finally {
      setLoading(false);
    }
  }, [caseId, t, user?.role]);

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

  const canSend =
    !!item &&
    user?.role !== 'ADMIN' &&
    (user?.role !== 'SPECIALIST' || item.specialist?.id === user?.id);

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
      setError(t('failedSendMessage', { ns: 'chats' }));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNote = async () => {
    if (user?.role !== 'SPECIALIST') return;
    setNoteSaving(true);
    try {
      const saved = await updateSpecialistCaseNote(caseId, noteDraft.trim());
      setNote(saved);
    } catch {
      setError(t('failedSaveNote', { ns: 'chats' }));
    } finally {
      setNoteSaving(false);
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
        <Alert color="red">{t('caseNotFound', { ns: 'chats' })}</Alert>
        <Button component={RouterLink} to="/chats" variant="light">
          {t('backToChats', { ns: 'chats' })}
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
            {t('backToChats', { ns: 'chats' })}
          </Button>
          <Title order={2}>{item.title}</Title>
          <Text c="dimmed">
            {t('client', { ns: 'chats' })}: {item.owner.displayName || item.owner.email}
          </Text>
          <Text c="dimmed">
            {t('specialist', { ns: 'chats' })}:{' '}
            {item.specialist?.displayName || item.specialist?.email || t('notAssigned', { ns: 'common' })}
          </Text>
        </Stack>
        <Group>
          <Badge color={statusColor[item.status] ?? 'gray'} variant="light" size="lg">
            {t(statusLabelKey[item.status] ?? 'unknown', { ns: 'common' })}
          </Badge>
          <Button component={RouterLink} to={`/cases/${item.id}`} variant="light" color="gray">
            {t('openCaseDetails', { ns: 'chats' })}
          </Button>
        </Group>
      </Group>

      {(user?.role === 'SPECIALIST' || user?.role === 'ADMIN') && note ? (
        <Card withBorder radius="lg" p="md" className="bg-white">
          <Stack gap="sm">
            <Title order={5}>{t('specialistNote', { ns: 'chats' })}</Title>
            {user.role === 'SPECIALIST' ? (
              <>
                <Textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.currentTarget.value)}
                  minRows={3}
                  placeholder={t('specialistNotePlaceholder', { ns: 'chats' })}
                />
                <Group justify="flex-end">
                  <Button onClick={() => void handleSaveNote()} loading={noteSaving} color="brand.7">
                    {t('saveNote', { ns: 'chats' })}
                  </Button>
                </Group>
              </>
            ) : (
              <Text>{note.body || t('noNoteYet', { ns: 'chats' })}</Text>
            )}
          </Stack>
        </Card>
      ) : null}

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="sm">
          <Title order={4}>{t('caseChat', { ns: 'chats' })}</Title>
          <Group align="end">
            <TextInput
              className="flex-1"
              label={t('reply', { ns: 'chats' })}
              placeholder={
                canSend
                  ? t('replyPlaceholder', { ns: 'chats' })
                  : t('cannotPostByRole', { ns: 'chats' })
              }
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              disabled={!canSend}
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
              {t('send', { ns: 'chats' })}
            </Button>
          </Group>
          <ScrollArea h={520} type="always" scrollbarSize={8} offsetScrollbars>
            {messages.length === 0 ? <Text c="dimmed">{t('noMessagesYet', { ns: 'chats' })}</Text> : null}
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
          </ScrollArea>
        </Stack>
      </Card>
    </Stack>
  );
}
