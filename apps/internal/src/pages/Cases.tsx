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
import { assignCaseToSelf, listCases } from '../api/cases';
import { useAuth } from '@reloplanner/shared-frontend';

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED: 'indigo',
  IN_PROGRESS: 'blue',
  NEEDS_USER_INPUT: 'orange',
  CANCELED: 'red',
  COMPLETED: 'teal',
};

export default function Cases() {
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
      setError('Failed to load case queue');
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
      setError('Failed to assign case to you');
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
        {user?.role === 'SPECIALIST' ? 'Case Pool' : 'Internal Case Queue'}
      </Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      {items.length === 0 ? <Text c="dimmed">No cases available right now.</Text> : null}
      {items.map((item) => (
        <Card key={item.id} withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>{item.title}</Text>
              <Badge color={statusColor[item.status] ?? 'gray'} variant="light">
                {item.status.replaceAll('_', ' ')}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Owner: {item.owner.displayName || item.owner.email}
            </Text>
            <Text size="sm" c="dimmed">
              Profile: {item.profile?.desiredRole || 'N/A'} to {item.profile?.targetCountry || 'N/A'}
              {item.profile?.targetCity ? `, ${item.profile.targetCity}` : ''}
            </Text>
            <Text size="sm" c="dimmed">
              Specialist: {item.specialist?.displayName || item.specialist?.email || 'Not assigned'}
            </Text>
            <Group justify="space-between">
              <Group gap="sm">
                {typeof item.unreadCount === 'number' && item.unreadCount > 0 ? (
                  <Badge color="red">{item.unreadCount} unread</Badge>
                ) : null}
                <Text size="sm" c="dimmed">
                  Updated: {new Date(item.updatedAt).toLocaleString()}
                </Text>
              </Group>
              <Button
                component={RouterLink}
                to={`/cases/${item.id}`}
                color="brand.7"
                variant="light"
              >
                Open workspace
              </Button>
              {user?.role === 'SPECIALIST' && !item.specialist ? (
                <Button
                  color="teal"
                  variant="light"
                  onClick={() => void handleAssignToMe(item.id)}
                  loading={busyCaseId === item.id}
                >
                  Assign to me
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
