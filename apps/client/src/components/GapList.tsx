import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { GapItem } from '../types';

interface Props {
  gaps: GapItem[];
}

const severityOrder: Record<string, number> = { CRITICAL: 0, MODERATE: 1, MINOR: 2 };

const severityColor = (severity: string) => {
  if (severity === 'CRITICAL') return 'red';
  if (severity === 'MODERATE') return 'yellow';
  return 'blue';
};

export default function GapList({ gaps }: Props) {
  const { t } = useTranslation(['components', 'common']);
  const sorted = [...gaps].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <Stack gap="sm">
      <Title order={3}>{t('skillGaps', { ns: 'components' })}</Title>
      {sorted.map((gap) => (
        <Card key={gap.id} withBorder radius="md" p="md" className="bg-white">
          <Group justify="space-between" wrap="wrap">
            <Group>
              <Badge color={severityColor(gap.severity)}>{gap.severity}</Badge>
              <Text fw={600}>{gap.skill?.name || gap.skillId}</Text>
            </Group>
            <Group gap="xs">
              <Text c="dimmed" size="sm">{gap.gapType}</Text>
              <Badge variant="outline" color="brand.7">
                ~{gap.estimatedMonths} {t('monthShort', { ns: 'common' })}
              </Badge>
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
