import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { CaseMessage, CaseReadState, RelocationCase } from '@reloplanner/shared-contracts';
import { useAuth, useRealtimeCase } from '@reloplanner/shared-frontend';
import {
  archiveCase,
  cancelCase,
  getCase,
  getCaseReadState,
  listCaseMessages,
  markCaseRead,
  postCaseMessage,
  submitCase,
} from '../api/cases';

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED: 'indigo',
  IN_PROGRESS: 'blue',
  NEEDS_USER_INPUT: 'orange',
  ARCHIVED: 'dark',
  CANCELED: 'red',
  COMPLETED: 'teal',
};

export default function CaseDetail() {
  const { caseId = '' } = useParams();
  const { token, user } = useAuth();
  const [item, setItem] = useState<RelocationCase | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [readStates, setReadStates] = useState<CaseReadState[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setError('Failed to load case details');
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
  const canArchive = item?.status !== 'ARCHIVED';
  const canCancel = item?.status !== 'CANCELED' && item?.status !== 'ARCHIVED';

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

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    try {
      await postCaseMessage(caseId, content);
      setText('');
      await markCaseRead(caseId);
      await loadAll();
    } catch {
      setError('Failed to send message');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusAction = async (action: 'submit' | 'archive' | 'cancel') => {
    setBusy(true);
    try {
      if (action === 'submit') await submitCase(caseId);
      if (action === 'archive') await archiveCase(caseId);
      if (action === 'cancel') await cancelCase(caseId);
      await loadAll();
    } catch {
      setError(`Failed to ${action} case`);
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
        <Alert color="red">Case not found</Alert>
        <Button component={RouterLink} to="/cases" variant="light">
          Back to cases
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
            Back to cases
          </Button>
          <Title order={2}>{item.title}</Title>
          <Text c="dimmed">{item.description || 'No extra context provided.'}</Text>
        </Stack>
        <Badge color={statusColor[item.status] ?? 'gray'} variant="light" size="lg">
          {item.status.replaceAll('_', ' ')}
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
            Submit
          </Button>
          <Button
            onClick={() => void handleStatusAction('archive')}
            disabled={!canArchive || busy}
            color="gray"
            variant="light"
          >
            Archive
          </Button>
          <Button
            onClick={() => void handleStatusAction('cancel')}
            disabled={!canCancel || busy}
            color="red"
            variant="light"
          >
            Cancel
          </Button>
          {currentReadState ? (
            <Badge color={currentReadState.unreadCount > 0 ? 'red' : 'teal'}>
              Unread: {currentReadState.unreadCount}
            </Badge>
          ) : null}
        </Group>
      </Card>

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="sm">
          <Title order={4}>Case Chat</Title>
          <Stack gap="xs" className="max-h-[420px] overflow-y-auto pr-1">
            {messages.length === 0 ? <Text c="dimmed">No messages yet.</Text> : null}
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
                        {message.kind}
                      </Badge>
                      <Text size="sm" fw={600}>
                        {message.author?.displayName || message.author?.email || 'System'}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {new Date(message.createdAt).toLocaleString()}
                    </Text>
                  </Group>
                  <Text>{message.content}</Text>
                </Stack>
              </Card>
            ))}
          </Stack>
          <Group align="end">
            <TextInput
              className="flex-1"
              label="New message"
              placeholder="Ask your specialist a focused question..."
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
            />
            <Button onClick={() => void handleSend()} disabled={busy || !text.trim()} color="brand.7">
              Send
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
