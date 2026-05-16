import { Progress, Stack, Text, Title, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SkillMatchResult } from '../types';

interface Props {
  breakdown: SkillMatchResult[];
  skills: Map<string, string>;
}

export default function SkillBreakdown({ breakdown, skills }: Props) {
  const { t } = useTranslation('components');

  return (
    <Stack gap="sm">
      <Title order={3}>{t('skillBreakdown')}</Title>
      {breakdown.map((item) => {
        const pct = Math.round(item.matchScore * 100);
        const color = pct >= 70 ? 'teal' : pct >= 40 ? 'yellow' : 'red';
        return (
          <Stack key={item.skillId} gap={4}>
            <Group justify="space-between">
              <Text>{skills.get(item.skillId) || item.skillId}</Text>
              <Text fw={700} c={`${color}.7`}>
                {pct}%{item.source === 'transferability' ? ` ${t('transfer')}` : ''}
              </Text>
            </Group>
            <Progress value={pct} color={color} />
          </Stack>
        );
      })}
    </Stack>
  );
}
