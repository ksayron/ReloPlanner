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
import { useTranslation } from 'react-i18next';
import type { RelocationCase, RelocationProfile } from '@reloplanner/shared-contracts';
import { createCase, listCases } from '../api/cases';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
import { listProfiles } from '../api/profiles';

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

export default function Cases() {
  const { t } = useTranslation(['cases', 'common']);
  const { language } = useAppLanguage();
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
      setError(t('cases:failedLoad'));
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
      setError(t('cases:failedCreate'));
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
      <Title order={2}>{t('cases:title')}</Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={4}>{t('cases:createNew')}</Title>
          <TextInput
            label={t('cases:caseTitle')}
            placeholder={t('cases:caseTitlePlaceholder')}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Select
            label={t('cases:attachedProfile')}
            placeholder={t('cases:selectProfile')}
            data={profiles.map((profile) => ({
              value: profile.id,
            label: `${profile.desiredRole} -> ${profile.targetCountry}${profile.targetCity ? `, ${profile.targetCity}` : ''}`,
            }))}
            value={profileId}
            onChange={setProfileId}
            searchable
          />
          {profiles.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('cases:noProfiles')}
            </Text>
          ) : null}
          <Textarea
            label={t('cases:additionalNotes')}
            placeholder={t('cases:additionalNotesPlaceholder')}
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
              {t('cases:createCase')}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Stack>
        {items.length === 0 ? (
          <Text c="dimmed">{t('cases:noCases')}</Text>
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
                  {formatCaseStatus(item.status, (key) => t(`common:${key}`))}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {t('cases:updated')}: {new Date(item.updatedAt).toLocaleString(language)}
                </Text>
                <Group gap="sm">
                  {typeof item.unreadCount === 'number' && item.unreadCount > 0 ? (
                    <Badge color="red">{t('cases:unread', { count: item.unreadCount })}</Badge>
                  ) : null}
                  <Button component={RouterLink} to={`/cases/${item.id}`} variant="light" color="brand.7">
                    {t('cases:openCase')}
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
