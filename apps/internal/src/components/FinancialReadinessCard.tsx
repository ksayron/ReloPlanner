import { useEffect, useState } from 'react';
import { Alert, Badge, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import client from '../api/client';
import type { FinancialReadinessResult } from '../types';

function riskColor(level: FinancialReadinessResult['financialRiskLevel']) {
  if (level === 'HIGH') return 'red';
  if (level === 'MODERATE') return 'yellow';
  if (level === 'LOW') return 'teal';
  return 'gray';
}

export default function FinancialReadinessCard({ profileId }: { profileId: string }) {
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
        setError('Failed to evaluate financial readiness.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  return (
    <Card withBorder radius="lg" p="lg" className="bg-white">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>Financial Readiness</Title>
          {loading ? <Loader size="sm" color="brand.7" /> : null}
        </Group>

        {error && <Alert color="red">{error}</Alert>}
        {!loading && !error && result && (
          <>
            <Group gap="sm" wrap="wrap">
              <Badge color={riskColor(result.financialRiskLevel)} variant="light">
                Risk: {result.financialRiskLevel}
              </Badge>
              <Badge color="brand.1" variant="light">
                CoL Source: {result.costEstimate.source}
              </Badge>
              <Badge color="brand.1" variant="light">
                Monthly Need: {result.costEstimate.totalMonthlyEstimateUsd.toFixed(2)} USD
              </Badge>
              <Badge color="brand.1" variant="light">
                Runway:{' '}
                {result.runwayMonths !== null
                  ? `${result.runwayMonths.toFixed(1)} months`
                  : 'Unavailable'}
              </Badge>
            </Group>

            <Text size="sm">{result.summary}</Text>
            <Text size="sm" c="dimmed">
              Recommended savings: {result.recommendedSavingsAmount.toFixed(2)}{' '}
              {result.recommendedSavingsCurrency}
            </Text>

            <Stack gap={6}>
              <Text fw={700}>Warnings</Text>
              {result.warnings.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No specific warnings.
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
              <Text fw={700}>Advice</Text>
              {result.advice.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No additional advice.
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
