import { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
import client from '../api/client';
import type { LegalReadinessResult } from '../types';

function resolveRiskColor(level: LegalReadinessResult['overallRisk']) {
  if (level === 'HIGH') return 'red';
  if (level === 'MODERATE') return 'yellow';
  if (level === 'LOW') return 'teal';
  return 'gray';
}

export default function LegalReadinessCard({ profileId }: { profileId: string }) {
  const { t } = useTranslation('components');
  const { language } = useAppLanguage();
  const [result, setResult] = useState<LegalReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        setError(t('failedLegalReadiness'));
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, t]);

  return (
    <Card withBorder radius="lg" p="lg" className="bg-white">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Title order={3}>{t('legalVisaReadiness')}</Title>
          {loading ? <Loader size="sm" color="brand.7" /> : null}
        </Group>

        {error && <Alert color="red">{error}</Alert>}

        {!loading && !error && result && (
          <>
            <Group gap="sm" wrap="wrap">
              <Badge color={resolveRiskColor(result.overallRisk)} variant="light">
                {t('risk')}: {result.overallRisk}
              </Badge>
              <Badge color={result.visaCheckLikelyRequired ? 'orange' : 'teal'} variant="light">
                {t('visaLegalCheck')}: {result.visaCheckLikelyRequired ? t('likelyRequired') : t('lowerComplexity')}
              </Badge>
            </Group>

            <Stack gap={6}>
              <Text fw={700}>{t('why')}</Text>
              {result.triggeredRules.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noLegalRulesTriggered')}
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
              <Text fw={700}>{t('questionsToClarify')}</Text>
              {result.questions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noQuestionsNow')}
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
              <Text fw={700}>{t('possibleRoutes')}</Text>
              {result.possibleRoutes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noRouteHints')}
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
              <Text fw={700}>{t('warnings')}</Text>
              {result.warnings.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noSpecificWarnings')}
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
              <Text fw={700}>{t('advice')}</Text>
              {result.advice.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noAdditionalAdvice')}
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
              <Text fw={700}>{t('recommendedReading')}</Text>
              {result.recommendedArticleSlugs.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('noRecommendedSlugs')}
                </Text>
              ) : (
                result.recommendedArticleSlugs.map((slug) => (
                  <Button
                    key={slug}
                    component={RouterLink}
                    to={`/knowledge/${slug}?language=${language}`}
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
