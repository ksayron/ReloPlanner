import { useMemo, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import client from '../api/client';
import type { LegalReadinessResult } from '../types';

function resolveRiskColor(level: LegalReadinessResult['overallRisk']) {
  if (level === 'HIGH') return 'red';
  if (level === 'MODERATE') return 'yellow';
  if (level === 'LOW') return 'teal';
  return 'gray';
}

function getLocale(): string {
  const fromStorage =
    localStorage.getItem('locale') ?? localStorage.getItem('language') ?? '';
  const fallback = fromStorage || navigator.language || 'en';
  return fallback.slice(0, 2).toLowerCase();
}

export default function LegalReadinessCard({ profileId }: { profileId: string }) {
  const [result, setResult] = useState<LegalReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const locale = useMemo(() => getLocale(), []);

  useEffect(() => {
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await client.get<LegalReadinessResult>(
          `/profiles/${profileId}/legal-readiness`,
        );
        setResult(response.data);
      } catch {
        setError('Failed to evaluate legal readiness.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  return (
    <Card withBorder radius="lg" p="lg" className="bg-white">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>Legal / Visa Readiness</Title>
          {loading ? <Loader size="sm" color="brand.7" /> : null}
        </Group>

        {error && <Alert color="red">{error}</Alert>}

        {!loading && !error && result && (
          <>
            <Group gap="sm" wrap="wrap">
              <Badge color={resolveRiskColor(result.overallRisk)} variant="light">
                Risk: {result.overallRisk}
              </Badge>
              <Badge color={result.visaCheckLikelyRequired ? 'orange' : 'teal'} variant="light">
                Visa/Legal Check: {result.visaCheckLikelyRequired ? 'Likely Required' : 'Lower Complexity'}
              </Badge>
            </Group>

            <Stack gap={6}>
              <Text fw={700}>Why</Text>
              {result.triggeredRules.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No specific legal-readiness rules were triggered.
                </Text>
              ) : (
                result.triggeredRules.map((rule) => (
                  <Text key={rule.code} size="sm">
                    - {rule.description}
                  </Text>
                ))
              )}
            </Stack>

            <Stack gap={6}>
              <Text fw={700}>Questions to Clarify</Text>
              {result.questions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No additional clarification questions right now.
                </Text>
              ) : (
                result.questions.map((question) => (
                  <Text key={question.key} size="sm">
                    - {question.text}
                  </Text>
                ))
              )}
            </Stack>

            <Stack gap={6}>
              <Text fw={700}>Possible Routes to Check</Text>
              {result.possibleRoutes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No route hints available for current profile data.
                </Text>
              ) : (
                result.possibleRoutes.map((route) => (
                  <Text key={route.code} size="sm">
                    - {route.title}: {route.description}
                  </Text>
                ))
              )}
            </Stack>

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

            <Stack gap={6}>
              <Text fw={700}>Recommended Reading</Text>
              {result.recommendedArticleSlugs.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No recommended article slugs.
                </Text>
              ) : (
                result.recommendedArticleSlugs.map((slug) => (
                  <Button
                    key={slug}
                    component={RouterLink}
                    to={`/knowledge/${slug}?language=${locale}`}
                    variant="subtle"
                    color="brand.7"
                    w="fit-content"
                  >
                    {slug}
                  </Button>
                ))
              )}
            </Stack>

            <Alert color="gray">{result.disclaimer}</Alert>
          </>
        )}
      </Stack>
    </Card>
  );
}
