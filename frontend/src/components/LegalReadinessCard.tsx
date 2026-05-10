import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import client from '../api/client';
import type { LegalReadinessResult } from '../types';

type AnswerValue = 'unknown' | 'yes' | 'no';

type SupportedQuestionKey =
  | 'hasExistingWorkAuthorization'
  | 'hasJobOffer'
  | 'hasRecognizedDegree'
  | 'hasFormalEducation'
  | 'relocationWithFamily'
  | 'hasFamilyDocumentsPrepared'
  | 'hasCheckedDependentResidenceRules';

const supportedQuestionKeys = new Set<SupportedQuestionKey>([
  'hasExistingWorkAuthorization',
  'hasJobOffer',
  'hasRecognizedDegree',
  'hasFormalEducation',
  'relocationWithFamily',
  'hasFamilyDocumentsPrepared',
  'hasCheckedDependentResidenceRules',
]);

type ProfileFacts = {
  currentCountry: string;
  targetCountry: string;
  targetCity?: string | null;
  desiredRole?: string | null;
};

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

function toBoolean(value: AnswerValue): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

export default function LegalReadinessCard({ profileId }: { profileId: string }) {
  const [profile, setProfile] = useState<ProfileFacts | null>(null);
  const [result, setResult] = useState<LegalReadinessResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');

  const locale = useMemo(() => getLocale(), []);

  const evaluate = useCallback(async () => {
    if (!profile) return;
    setEvaluating(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        sourceCountry: profile.currentCountry,
        targetCountry: profile.targetCountry,
        targetCity: profile.targetCity ?? undefined,
        desiredRole: profile.desiredRole ?? undefined,
      };

      for (const [key, value] of Object.entries(answers)) {
        if (!supportedQuestionKeys.has(key as SupportedQuestionKey)) continue;
        const boolValue = toBoolean(value);
        if (typeof boolValue === 'boolean') {
          payload[key] = boolValue;
        }
      }

      const response = await client.post<LegalReadinessResult>(
        '/legal-readiness/evaluate',
        payload,
      );
      setResult(response.data);
    } catch {
      setError('Failed to evaluate legal readiness.');
    } finally {
      setEvaluating(false);
    }
  }, [answers, profile]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const profileResponse = await client.get<ProfileFacts>(`/profiles/${profileId}`);
        setProfile(profileResponse.data);
      } catch {
        setError('Failed to load profile context for legal readiness.');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  useEffect(() => {
    if (!profile) return;
    void evaluate();
  }, [profile, evaluate]);

  return (
    <Card withBorder radius="lg" p="lg" className="bg-white">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>Legal / Visa Readiness</Title>
          {evaluating ? <Loader size="sm" color="brand.7" /> : null}
        </Group>

        {loading && (
          <Group justify="center" py="sm">
            <Loader color="brand.7" />
          </Group>
        )}

        {!loading && error && <Alert color="red">{error}</Alert>}

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

            <Stack gap={8}>
              <Text fw={700}>Additional Questions</Text>
              {result.questions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No additional legal clarification questions right now.
                </Text>
              ) : (
                result.questions.map((question) => (
                  <Group key={question.key} grow align="flex-end">
                    <Text size="sm">{question.text}</Text>
                    <Select
                      value={answers[question.key] ?? 'unknown'}
                      onChange={(value) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [question.key]: (value as AnswerValue) ?? 'unknown',
                        }))
                      }
                      data={[
                        { value: 'unknown', label: 'Unknown' },
                        { value: 'yes', label: 'Yes' },
                        { value: 'no', label: 'No' },
                      ]}
                    />
                  </Group>
                ))
              )}
              {result.questions.length > 0 && (
                <Button
                  onClick={() => void evaluate()}
                  loading={evaluating}
                  color="brand.7"
                  w="fit-content"
                >
                  Re-evaluate Legal Readiness
                </Button>
              )}
            </Stack>

            <Stack gap={6}>
              <Text fw={700}>Possible Routes to Check</Text>
              {result.possibleRoutes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No route hints available for current answers.
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
