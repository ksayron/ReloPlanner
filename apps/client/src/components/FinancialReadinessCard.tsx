import { useEffect, useState } from 'react';
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import type { FinancialReadinessResult } from '../types';

function riskColor(level: FinancialReadinessResult['financialRiskLevel']) {
  if (level === 'HIGH') return 'red';
  if (level === 'MODERATE') return 'yellow';
  if (level === 'LOW') return 'teal';
  return 'gray';
}

export default function FinancialReadinessCard({ profileId }: { profileId: string }) {
  const { t } = useTranslation(['components', 'common']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FinancialReadinessResult | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await client.get<FinancialReadinessResult>(
          `/profiles/${profileId}/financial-readiness`,
        );
        setResult(response.data);
      } catch {
        setError(t('failedFinancialReadiness', { ns: 'components' }));
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, t]);

  return (
    <Card withBorder radius="lg" p="lg" className="bg-white">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>{t('financialReadiness', { ns: 'components' })}</Title>
          {loading ? <Loader size="sm" color="brand.7" /> : null}
        </Group>

        {error && <Alert color="red">{error}</Alert>}
        {!loading && !error && result && (
          <>
            <Group gap="sm" wrap="wrap">
              <Badge color={riskColor(result.financialRiskLevel)} variant="light">
                {t('risk', { ns: 'components' })}: {result.financialRiskLevel}
              </Badge>
              <Badge color="brand.1" variant="light">
                {t('colSource', { ns: 'components' })}: {result.costEstimate.source}
              </Badge>
              <Badge color="brand.1" variant="light">
                {t('monthlyNeed', { ns: 'components' })}: {result.costEstimate.totalMonthlyEstimateUsd.toFixed(2)} USD
              </Badge>
              <Badge color="brand.1" variant="light">
                {t('runway', { ns: 'components' })}:{' '}
                {result.runwayMonths !== null
                  ? `${result.runwayMonths.toFixed(1)} ${t('months', { ns: 'common' })}`
                  : t('unavailable', { ns: 'components' })}
              </Badge>
            </Group>

            <Text size="sm">{result.summary}</Text>
            <Text size="sm" c="dimmed">
              {t('recommendedSavings', { ns: 'components' })}: {result.recommendedSavingsAmount.toFixed(2)}{' '}
              {result.recommendedSavingsCurrency}
            </Text>

            <Stack gap={6}>
              <Text fw={700}>{t('warnings', { ns: 'components' })}</Text>
              {result.warnings.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noSpecificWarnings', { ns: 'components' })}
                </Text>
              ) : (
                result.warnings.map((warning) => (
                  <Text key={warning.code} size="sm">
                    - {warning.message}
                  </Text>
                ))
              )}
            </Stack>

            <Stack gap={6}>
              <Text fw={700}>{t('advice', { ns: 'components' })}</Text>
              {result.advice.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noAdditionalAdvice', { ns: 'components' })}
                </Text>
              ) : (
                result.advice.map((advice) => (
                  <Text key={advice.code} size="sm">
                    - {advice.message}
                  </Text>
                ))
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}
