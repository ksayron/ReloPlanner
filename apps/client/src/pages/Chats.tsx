import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title, Button } from '@mantine/core';
import type { CaseChatSummary } from '@reloplanner/shared-contracts';
import { listCaseChats } from '../api/cases';

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED: 'indigo',
  IN_PROGRESS: 'blue',
  NEEDS_USER_INPUT: 'orange',
  CANCELED: 'red',
  COMPLETED: 'teal',
};

export default function Chats() {
  const [items, setItems] = useState<CaseChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCaseChats());
    } catch {
      setError('Failed to load chats');
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
      <Title order={2}>Chats</Title>
      {error ? <Alert color="red">{error}</Alert> : null}
      {items.length === 0 ? <Text c="dimmed">No case chats yet.</Text> : null}
      {items.map((item) => (
        <Card key={item.caseId} withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>{item.caseTitle}</Text>
              <Badge color={statusColor[item.caseStatus] ?? 'gray'} variant="light">
                {item.caseStatus.replaceAll('_', ' ')}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Specialist: {item.specialistName || 'Not assigned'}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {item.lastMessage
                ? `${item.lastMessage.senderName}: ${item.lastMessage.body}`
                : 'No messages yet'}
            </Text>
            <Group justify="space-between">
              <Group gap="sm">
                {item.unreadCount > 0 ? <Badge color="red">{item.unreadCount} unread</Badge> : null}
                <Text size="sm" c="dimmed">
                  Updated: {new Date(item.lastActivityAt).toLocaleString()}
                </Text>
              </Group>
              <Group gap="sm">
                <Button component={RouterLink} to={`/cases/${item.caseId}`} variant="subtle" color="gray">
                  Open case
                </Button>
                <Button component={RouterLink} to={`/chats/${item.caseId}`} color="brand.7" variant="light">
                  Open chat
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
