import { Card, Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface Props {
  score: number;
}

export default function FitScoreCard({ score }: Props) {
  const { t } = useTranslation('components');
  const percentage = Math.round(score * 100);
  const color = percentage >= 70 ? 'teal' : percentage >= 40 ? 'yellow' : 'red';

  return (
    <Card withBorder radius="lg" p="xl" className="bg-white text-center">
      <Stack gap="xs" align="center">
        <Text fz="2.5rem" fw={700} c={`${color}.7`}>
          {score.toFixed(3)}
        </Text>
        <Text c="dimmed">{t('fitScore', { percentage })}</Text>
        <Progress value={percentage} color={color} w="100%" />
      </Stack>
    </Card>
  );
}
