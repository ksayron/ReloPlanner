import { Badge, Card, Group, Progress, Select, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { GapItem, GapStatus } from '../types';

interface Props {
  gaps: GapItem[];
  onStatusChange?: (gapId: string, status: GapStatus) => void;
}

const statusColor = (status: GapStatus) => {
  if (status === 'COMPLETED') return 'teal';
  if (status === 'IN_PROGRESS') return 'yellow';
  return 'gray';
};

export default function RoadmapTimeline({ gaps, onStatusChange }: Props) {
  const { t } = useTranslation('components');
  const sorted = [...gaps].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <Stack gap="sm">
      <Title order={3}>{t('preparationRoadmap')}</Title>
      {sorted.map((gap, index) => (
        <Card key={gap.id} withBorder radius="md" p="md" className="bg-white">
          <Stack gap="xs">
            <Group justify="space-between" wrap="wrap">
              <Group>
                <Badge color={statusColor(gap.status)}>{index + 1}</Badge>
                <Text fw={600}>{gap.skill?.name || gap.skillId}</Text>
              </Group>
              <Badge variant="outline" color="brand.7">~{gap.estimatedMonths} {t('months')}</Badge>
            </Group>
            <Progress value={Math.min(100, ((index + 1) / Math.max(sorted.length, 1)) * 100)} color="brand.7" />
            {onStatusChange && (
              <Select
                label={t('status')}
                value={gap.status}
                data={[
                  { value: 'PENDING', label: t('pending') },
                  { value: 'IN_PROGRESS', label: t('inProgress') },
                  { value: 'COMPLETED', label: t('completed') },
                ]}
                onChange={(value) => value && onStatusChange(gap.id, value as GapStatus)}
                w={180}
              />
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
