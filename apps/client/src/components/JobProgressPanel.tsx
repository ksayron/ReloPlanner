import { Button, Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { ProcessingJobSnapshot } from '../types';
import { formatEnumLabel, getJobStepLabel } from '../utils/jobProgress';

interface JobProgressPanelProps {
  title: string;
  job: ProcessingJobSnapshot;
  jobHistory: ProcessingJobSnapshot[];
  onRetry?: () => void;
  retryLabel?: string;
}

export default function JobProgressPanel({
  title,
  job,
  jobHistory,
  onRetry,
  retryLabel,
}: JobProgressPanelProps) {
  const { t } = useTranslation(['components', 'common']);

  return (
    <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60">
      <Stack gap="xs">
        <Title order={5}>{title}</Title>
        <Text size="sm">
          {t('jobStatus', { ns: 'components' })}: <strong>{formatEnumLabel(job.status)}</strong>
        </Text>
        <Text size="sm">
          {t('jobCurrentStep', { ns: 'components' })}: <strong>{getJobStepLabel(job.currentStep)}</strong>
        </Text>
        <Progress
          value={Math.max(0, Math.min(100, job.progressPercent))}
          color={job.status === 'FAILED' ? 'red' : 'teal'}
        />
        <Text size="sm" c="dimmed">
          {t('jobCompletePercent', { ns: 'components', value: job.progressPercent })}
        </Text>
        {jobHistory.map((item, idx) => (
          <Group
            key={`${item.currentStep}-${item.progressPercent}-${idx}`}
            justify="space-between"
          >
            <Text
              size="xs"
              c={item.status === 'FAILED' ? 'red' : item.status === 'COMPLETED' ? 'teal' : 'dimmed'}
            >
              {getJobStepLabel(item.currentStep)}
            </Text>
            <Text size="xs" c="dimmed">
              {item.progressPercent}%
            </Text>
          </Group>
        ))}
        {job.status === 'FAILED' && onRetry ? (
          <Button onClick={onRetry} color="brand.7" w="fit-content">
            {retryLabel || t('retry', { ns: 'common' })}
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
