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
import client from '../api/client';
import type { GapStatus, RoadmapStep, TimeEstimate } from '../types';

interface RoadmapData {
  totalPrepMonths: number;
  timeEstimate: TimeEstimate | null;
  steps: RoadmapStep[];
}

export default function ProgressTracker() {
  const { profileId } = useParams<{ profileId: string }>();
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    client
      .get(`/profiles/${profileId}/roadmap`)
      .then((res) => setRoadmap(res.data))
      .catch(() => setError('Failed to load roadmap'))
      .finally(() => setLoading(false));
  }, [profileId]);

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
      setError('Failed to update status');
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
      <Title order={2}>Progress Tracker</Title>
      {error && <Alert color="red">{error}</Alert>}

      {roadmap && (
        <>
          <Card withBorder radius="lg" padding="lg" className="bg-white">
            <Text fw={600}>Total Estimated Preparation: {roadmap.totalPrepMonths} months</Text>
            {roadmap.timeEstimate && (
              <Group gap="md" mt="sm">
                <Badge variant="light" color="brand.1">Optimistic: {roadmap.timeEstimate.optimisticHours}h</Badge>
                <Badge variant="light" color="brand.1">Realistic: {roadmap.timeEstimate.realisticHours}h</Badge>
                <Badge variant="light" color="brand.1">Critical Path: {roadmap.timeEstimate.criticalPathHours}h</Badge>
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
                      <Text size="sm" c="dimmed">{step.currentDisplayLevel} to {step.requiredDisplayLevel}</Text>
                      <Badge variant="outline" color="brand.7">{step.estimatedHours}h</Badge>
                      <Select
                        size="xs"
                        w={140}
                        value={step.status}
                        data={[
                          { value: 'PENDING', label: 'Pending' },
                          { value: 'IN_PROGRESS', label: 'In Progress' },
                          { value: 'COMPLETED', label: 'Completed' },
                        ]}
                        onChange={(value) => value && updateStatus(step.id, value as GapStatus)}
                      />
                    </Group>
                  </Group>
                </Card>
              ))}
          </Stack>

          {roadmap.steps.length === 0 && <Text c="dimmed">No roadmap steps available.</Text>}
        </>
      )}
    </Stack>
  );
}
