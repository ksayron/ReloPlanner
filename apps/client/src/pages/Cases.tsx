import { useEffect, useMemo, useState } from 'react';
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
  Textarea,
  Title,
} from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';
import type { RelocationCase, RelocationProfile } from '@reloplanner/shared-contracts';
import { createCase, listCases } from '../api/cases';
import { listProfiles } from '../api/profiles';

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
  const [profileId, setProfileId] = useState<string | null>(null);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [profiles, setProfiles] = useState<RelocationProfile[]>([]);
  const [creating, setCreating] = useState(false);

  const canCreate = useMemo(
    () => title.trim().length >= 3 && Boolean(profileId),
    [profileId, title],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cases, profileRows] = await Promise.all([listCases(), listProfiles()]);
      setItems(cases);
      setProfiles(profileRows);
    } catch {
      setError('Failed to load cases or profiles');
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
        profileId: profileId as string,
        additionalNotes: additionalNotes.trim() || undefined,
      });
      setTitle('');
      setProfileId(null);
      setAdditionalNotes('');
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
          <Select
            label="Attached profile"
            placeholder="Select profile"
            data={profiles.map((profile) => ({
              value: profile.id,
              label: `${profile.desiredRole} to ${profile.targetCountry}${profile.targetCity ? `, ${profile.targetCity}` : ''}`,
            }))}
            value={profileId}
            onChange={setProfileId}
            searchable
          />
          {profiles.length === 0 ? (
            <Text size="sm" c="dimmed">
              No profiles found. Create a profile first, then open Cases again.
            </Text>
          ) : null}
          <Textarea
            label="Additional notes (optional)"
            placeholder="Any details that are not already covered by profile."
            minRows={3}
            autosize
            value={additionalNotes}
            onChange={(event) => setAdditionalNotes(event.currentTarget.value)}
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
                  {item.profile ? (
                    <Text size="sm" c="dimmed">
                      Profile: {item.profile.desiredRole} to {item.profile.targetCountry}
                      {item.profile.targetCity ? `, ${item.profile.targetCity}` : ''}
                    </Text>
                  ) : null}
                  {item.additionalNotes ? (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {item.additionalNotes}
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
