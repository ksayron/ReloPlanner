import { useEffect, useMemo, useState } from 'react';
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
  Textarea,
  Title,
} from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';
import type { RelocationCase } from '@reloplanner/shared-contracts';
import { createCase, listCases } from '../api/cases';

const statusColor: Record<string, string> = {
  DRAFT: 'gray',
  SUBMITTED: 'indigo',
  IN_PROGRESS: 'blue',
  NEEDS_USER_INPUT: 'orange',
  ARCHIVED: 'dark',
  CANCELED: 'red',
  COMPLETED: 'teal',
};

export default function Cases() {
  const [items, setItems] = useState<RelocationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = useMemo(() => title.trim().length >= 3, [title]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listCases());
    } catch {
      setError('Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      await createCase({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      await load();
    } catch {
      setError('Failed to create case');
    } finally {
      setCreating(false);
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
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Relocation Cases</Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={4}>Create New Case</Title>
          <TextInput
            label="Case title"
            placeholder="Example: Germany relocation with family"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Textarea
            label="Context"
            placeholder="Add goals, constraints, deadlines, visa context, or key questions."
            minRows={3}
            autosize
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              color="brand.7"
              onClick={() => void handleCreate()}
              disabled={!canCreate}
              loading={creating}
            >
              Create case
            </Button>
          </Group>
        </Stack>
      </Card>

      <Stack>
        {items.length === 0 ? (
          <Text c="dimmed">No cases yet. Create your first case above.</Text>
        ) : null}
        {items.map((item) => (
          <Card key={item.id} withBorder radius="lg" p="lg" className="bg-white">
            <Stack gap="xs">
              <Group justify="space-between" align="start">
                <Stack gap={0}>
                  <Text fw={700}>{item.title}</Text>
                  {item.description ? (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </Stack>
                <Badge color={statusColor[item.status] ?? 'gray'} variant="light">
                  {item.status.replaceAll('_', ' ')}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Updated: {new Date(item.updatedAt).toLocaleString()}
                </Text>
                <Group gap="sm">
                  {typeof item.unreadCount === 'number' && item.unreadCount > 0 ? (
                    <Badge color="red">{item.unreadCount} unread</Badge>
                  ) : null}
                  <Button component={RouterLink} to={`/cases/${item.id}`} variant="light" color="brand.7">
                    Open case
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
