import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type {
  DirectChatMessage,
  DirectChatParticipant,
  DirectChatThread,
} from '@reloplanner/shared-contracts';
import {
  listDirectChatClients,
  listDirectChatMessages,
  listDirectChatThreads,
  postDirectChatMessage,
  startDirectChat,
} from '../api/chats';

export default function Chats() {
  const [threads, setThreads] = useState<DirectChatThread[]>([]);
  const [clients, setClients] = useState<DirectChatParticipant[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );

  const loadThreadsAndClients = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [threadRows, clientRows] = await Promise.all([
        listDirectChatThreads(),
        listDirectChatClients(),
      ]);
      setThreads(threadRows);
      setClients(clientRows);
      if (threadRows.length > 0 && !selectedThreadId) {
        setSelectedThreadId(threadRows[0].id);
      }
    } catch {
      setError('Failed to load chats');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [selectedThreadId]);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      setMessages(await listDirectChatMessages(threadId));
    } catch {
      setMessages([]);
      setError('Failed to load chat messages');
    }
  }, []);

  useEffect(() => {
    void loadThreadsAndClients();
  }, [loadThreadsAndClients]);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadMessages(selectedThreadId);
  }, [loadMessages, selectedThreadId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadThreadsAndClients(true);
      if (selectedThreadId) {
        void loadMessages(selectedThreadId);
      }
    }, 8000);
    return () => window.clearInterval(id);
  }, [loadMessages, loadThreadsAndClients, selectedThreadId]);

  const handleStartChat = async () => {
    if (!selectedClientId) return;
    setError(null);
    try {
      const thread = await startDirectChat(selectedClientId);
      await loadThreadsAndClients();
      setSelectedThreadId(thread.id);
    } catch {
      setError('Failed to start chat');
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !selectedThreadId) return;
    setSending(true);
    setError(null);
    try {
      await postDirectChatMessage(selectedThreadId, content);
      setText('');
      await loadMessages(selectedThreadId);
      await loadThreadsAndClients();
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
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
    <Stack className="mx-auto max-w-7xl" gap="lg">
      <Title order={2}>Direct Chats</Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      <Card withBorder radius="lg" p="md" className="bg-white">
        <Group align="end">
          <Select
            className="min-w-[360px] flex-1"
            label="Start new chat with client"
            placeholder="Select client"
            value={selectedClientId}
            onChange={setSelectedClientId}
            data={clients.map((client) => ({
              value: client.id,
              label: client.displayName
                ? `${client.displayName} (${client.email})`
                : client.email,
            }))}
            searchable
          />
          <Button
            color="brand.7"
            variant="light"
            disabled={!selectedClientId}
            onClick={() => void handleStartChat()}
          >
            Start chat
          </Button>
        </Group>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card withBorder radius="lg" p="md" className="bg-white">
          <Stack gap="xs">
            <Text fw={600}>Threads</Text>
            {threads.length === 0 ? <Text c="dimmed">No direct chats yet.</Text> : null}
            {threads.map((thread) => (
              <Card
                key={thread.id}
                withBorder
                radius="md"
                p="sm"
                className="cursor-pointer bg-white"
                onClick={() => setSelectedThreadId(thread.id)}
              >
                <Stack gap={2}>
                  <Group justify="space-between">
                    <Text fw={600}>{thread.client.displayName || thread.client.email}</Text>
                    {selectedThreadId === thread.id ? (
                      <Badge color="brand.7" variant="light">
                        Open
                      </Badge>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {thread.lastMessage?.content || 'No messages yet'}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Card>

        <Card withBorder radius="lg" p="md" className="bg-white">
          <Stack gap="sm">
            <Text fw={600}>
              {selectedThread
                ? `Chat with ${selectedThread.client.displayName || selectedThread.client.email}`
                : 'Select a chat thread'}
            </Text>
            <Stack gap="xs" className="max-h-[540px] overflow-y-auto pr-1">
              {selectedThread && messages.length === 0 ? (
                <Text c="dimmed">No messages yet.</Text>
              ) : null}
              {messages.map((message) => (
                <Card key={message.id} withBorder radius="md" p="sm">
                  <Stack gap={2}>
                    <Group justify="space-between">
                      <Badge
                        color={
                          message.kind === 'SPECIALIST'
                            ? 'indigo'
                            : message.kind === 'SYSTEM'
                              ? 'gray'
                              : 'brand.7'
                        }
                        variant="light"
                      >
                        {message.kind}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {new Date(message.createdAt).toLocaleString()}
                      </Text>
                    </Group>
                    <Text size="sm" fw={600}>
                      {message.author.displayName || message.author.email}
                    </Text>
                    <Text>{message.content}</Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
            <Group align="end">
              <TextInput
                className="flex-1"
                label="Message"
                placeholder="Write a direct message..."
                value={text}
                onChange={(event) => setText(event.currentTarget.value)}
                disabled={!selectedThreadId}
              />
              <Button
                color="brand.7"
                onClick={() => void handleSend()}
                loading={sending}
                disabled={!selectedThreadId || !text.trim()}
              >
                Send
              </Button>
            </Group>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
