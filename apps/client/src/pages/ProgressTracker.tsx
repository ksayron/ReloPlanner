import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import type { GapStatus, RoadmapStep, TimeEstimate } from '../types';

interface RoadmapData {
  totalPrepMonths: number;
  timeEstimate: TimeEstimate | null;
  steps: RoadmapStep[];
}

export default function ProgressTracker() {
  const { t } = useTranslation(['progress', 'components']);
  const { profileId } = useParams<{ profileId: string }>();
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    client
      .get(`/profiles/${profileId}/roadmap`)
      .then((res) => setRoadmap(res.data))
      .catch(() => setError(t('progress:failedLoadRoadmap')))
      .finally(() => setLoading(false));
  }, [profileId, t]);

  const updateStatus = async (stepId: string, status: GapStatus) => {
    try {
      await client.patch(`/gaps/${stepId}/status`, { status });
      setRoadmap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((step) => (step.id === stepId ? { ...step, status } : step)),
        };
      });
    } catch {
      setError(t('progress:failedUpdateStatus'));
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  const statusColor = (status: GapStatus) =>
    status === 'COMPLETED' ? 'teal' : status === 'IN_PROGRESS' ? 'yellow' : 'gray';

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>{t('progress:title')}</Title>
      {error && <Alert color="red">{error}</Alert>}

      {roadmap && (
        <>
          <Card withBorder radius="lg" padding="lg" className="bg-white">
            <Text fw={600}>
              {t('progress:totalEstimatedPrep', { months: roadmap.totalPrepMonths })}
            </Text>
            {roadmap.timeEstimate && (
              <Group gap="md" mt="sm">
                <Badge variant="light" color="brand.1">
                  {t('progress:optimistic')}: {roadmap.timeEstimate.optimisticHours}h
                </Badge>
                <Badge variant="light" color="brand.1">
                  {t('progress:realistic')}: {roadmap.timeEstimate.realisticHours}h
                </Badge>
                <Badge variant="light" color="brand.1">
                  {t('progress:criticalPath')}: {roadmap.timeEstimate.criticalPathHours}h
                </Badge>
              </Group>
            )}
          </Card>

          <Stack gap="sm">
            {roadmap.steps
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((step, index) => (
                <Card key={step.id} withBorder radius="md" padding="md" className="bg-white">
                  <Group justify="space-between" align="center" wrap="wrap">
                    <Group gap="sm">
                      <Badge color={statusColor(step.status)}>{index + 1}</Badge>
                      <Text fw={600}>{step.competencyName}</Text>
                    </Group>
                    <Group gap="sm" wrap="wrap">
                      <Text size="sm" c="dimmed">
                        {step.currentDisplayLevel} {t('progress:to')} {step.requiredDisplayLevel}
                      </Text>
                      <Badge variant="outline" color="brand.7">{step.estimatedHours}h</Badge>
                      <Select
                        size="xs"
                        w={140}
                        value={step.status}
                        data={[
                          { value: 'PENDING', label: t('components:pending') },
                          { value: 'IN_PROGRESS', label: t('components:inProgress') },
                          { value: 'COMPLETED', label: t('components:completed') },
                        ]}
                        onChange={(value) => value && updateStatus(step.id, value as GapStatus)}
                      />
                    </Group>
                  </Group>
                </Card>
              ))}
          </Stack>

          {roadmap.steps.length === 0 && <Text c="dimmed">{t('progress:noSteps')}</Text>}
        </>
      )}
    </Stack>
  );
}
