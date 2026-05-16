import { useCallback, useEffect, useState } from 'react';
import { useParams, Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { getBillingStatus, startPremiumCheckout } from '../api/billing';
import { fetchMyPreferences } from '../api/preferences';
import JobProgressPanel from '../components/JobProgressPanel';
import LegalReadinessCard from '../components/LegalReadinessCard';
import FinancialReadinessCard from '../components/FinancialReadinessCard';
import SkillFitRadarChart from '../components/SkillFitRadarChart';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import type {
  AnalysisHistoryItem,
  AnalysisResult,
  BillingStatusResponse,
  JobMatchResult,
  ProcessingJobSnapshot,
  ReportSnapshotResponse,
  ReportVariant,
  TopMatchesResponse,
  UserPreferences,
} from '../types';
import { usePersistentJobStream } from '../hooks/usePersistentJobStream';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import { formatEnumLabel, getJobStepLabel } from '../utils/jobProgress';

const getFitScoreMessageKey = (scorePct: number) => {
  if (scorePct >= 80) return 'fitScoreMessageStrong';
  if (scorePct >= 60) return 'fitScoreMessageModerate';
  if (scorePct >= 40) return 'fitScoreMessageEarly';
  return 'fitScoreMessageLow';
};

const scoreColor = (score: number) => {
  if (score >= 70) return 'teal';
  if (score >= 40) return 'yellow';
  return 'red';
};

const extractPostingCity = (location: string) => {
  const normalized = location.trim();
  if (!normalized) return null;
  const [firstChunk] = normalized.split(',');
  const city = firstChunk?.trim();
  return city || normalized;
};

const formatSnapshotContext = (
  snapshot: AnalysisHistoryItem['snapshotMetadata'],
  language: 'en' | 'ru',
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (!snapshot) {
    return t('snapshotUnavailable');
  }

  const vacancies = Number.isFinite(snapshot.totalVacancies)
    ? snapshot.totalVacancies.toLocaleString(language)
    : t('common:unknown', { ns: 'common' });
  const location = snapshot.city
    ? `${snapshot.city}, ${snapshot.country}`
    : snapshot.country;
  const source = snapshot.source || t('unknownSource');
  const snapshotDate = snapshot.snapshotDate
    ? new Date(snapshot.snapshotDate).toLocaleDateString(language)
    : t('unknownDate');

  return t('snapshotBasedOn', { vacancies, location, source, snapshotDate });
};

export default function Dashboard() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { language } = useAppLanguage();
  const priorityLabel: Record<string, string> = {
    CORE: t('dashboard:priorityCore'),
    IMPORTANT: t('dashboard:priorityImportant'),
    OPTIONAL: t('dashboard:priorityOptional'),
    CONTEXTUAL: t('dashboard:priorityContextual'),
  };
  const { profileId } = useParams<{ profileId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'html' | null>(null);
  const [reportVariant, setReportVariant] = useState<ReportVariant>('snapshot');
  const [aiReport, setAiReport] = useState<ReportSnapshotResponse | null>(null);
  const [aiReportRequested, setAiReportRequested] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [pageError, setPageError] = useState('');
  const [topMatches, setTopMatches] = useState<JobMatchResult[]>([]);
  const [topMatchesAccess, setTopMatchesAccess] = useState<{
    requestedLimit: number;
    maxAllowedLimit: number | null;
    upgradeRequired: boolean;
  } | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [upgradeModalOpened, setUpgradeModalOpened] = useState(false);
  const [upgradeFeatureName, setUpgradeFeatureName] = useState<string>(t('dashboard:premiumFeature'));
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string>('');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [preferredReportLanguage, setPreferredReportLanguage] = useState<'en' | 'ru'>('en');
  const [weeklyStudyHours, setWeeklyStudyHours] = useState<number | null>(null);
  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadHistory = useCallback(async () => {
    if (!profileId) return;
    setHistoryLoading(true);
    try {
      const res = await client.get(`/profiles/${profileId}/results/history`, {
        params: { limit: 20 },
      });
      const items = Array.isArray(res.data?.items) ? (res.data.items as AnalysisHistoryItem[]) : [];
      setHistory(items);
    } finally {
      setHistoryLoading(false);
    }
  }, [profileId]);

  const loadBillingStatus = useCallback(async () => {
    try {
      const status = await getBillingStatus();
      setBillingStatus(status);
    } catch {
      setBillingStatus(null);
    }
  }, []);

  const refreshLatestResult = useCallback(async () => {
    if (!profileId) return;
    const res = await client.get(`/profiles/${profileId}/results`);
    setResult(res.data);
    setSelectedAnalysisId(res.data.id);
    setNoResults(false);
    await loadHistory();
  }, [loadHistory, profileId]);

  const loadActiveAnalysisJob = useCallback(async () => {
    if (!profileId) return null;
    const res = await client.get('/jobs/active', {
      params: {
        type: 'PROFILE_ANALYSIS',
        payloadKey: 'profileId',
        payloadValue: profileId,
      },
    });
    return res.data;
  }, [profileId]);

  const loadActiveReportJob = useCallback(async () => {
    if (!selectedAnalysisId) return null;
    const res = await client.get('/jobs/active', {
      params: {
        type: 'REPORT_GENERATION',
        payloadKey: 'analysisId',
        payloadValue: selectedAnalysisId,
      },
    });
    return res.data as ProcessingJobSnapshot | null;
  }, [selectedAnalysisId]);

  const {
    job,
    jobHistory,
    running: analyzing,
    error: jobError,
    setError: setJobError,
    startJob,
  } = usePersistentJobStream({
    enabled: Boolean(profileId),
    storageKey: `analysis-progress:${profileId ?? 'unknown'}`,
    streamDisconnectedMessage: t('dashboard:liveProgressDisconnected'),
    hideCompletedAfterMs: 5000,
    loadActiveJob: loadActiveAnalysisJob,
    onCompleted: async (snapshot) => {
      // Apply optimistic UI update immediately from job result, then reconcile with backend.
      const completedResult = (snapshot.result ?? null) as AnalysisResult | null;
      if (completedResult?.id) {
        setResult(completedResult);
        setSelectedAnalysisId(completedResult.id);
        setNoResults(false);
        setHistory((prev) => {
          const nextItem: AnalysisHistoryItem = {
            id: completedResult.id,
            createdAt: completedResult.createdAt,
            fitScore: completedResult.fitScore,
            totalPrepMonths: completedResult.totalPrepMonths,
            snapshotMetadata: completedResult.snapshotMetadata,
          };
          const withoutCurrent = prev.filter((item) => item.id !== nextItem.id);
          return [nextItem, ...withoutCurrent];
        });
      }

      try {
        await refreshLatestResult();
      } catch {
        // Keep optimistic state if immediate refetch is temporarily unavailable.
      }
    },
    onFailed: (snapshot) =>
      snapshot.errorMessage ??
      t('dashboard:analysisFailedAtStep', { step: getJobStepLabel(snapshot.currentStep) }),
    onActiveJobRestored: () => {
      setNoResults(false);
    },
  });

  const {
    job: aiReportJob,
    jobHistory: aiReportJobHistory,
    running: aiReportLoading,
    error: aiJobError,
    setError: setAiJobError,
    startJob: startAiReportJob,
  } = usePersistentJobStream({
    enabled: Boolean(selectedAnalysisId),
    storageKey: `report-generation:${selectedAnalysisId ?? 'unknown'}`,
    streamDisconnectedMessage: t('dashboard:aiReportStreamDisconnected'),
    hideCompletedAfterMs: 5000,
    loadActiveJob: loadActiveReportJob,
    onCompleted: async (snapshot) => {
      const payload = snapshot.result as { analysisId?: string; variant?: ReportVariant } | null;
      const analysisId = payload?.analysisId ?? selectedAnalysisId;
      if (!analysisId) return;
      const variant = payload?.variant === 'ai-summary' ? 'ai-summary' : 'snapshot';
      const response = await client.get<ReportSnapshotResponse>(`/reports/analyses/${analysisId}`, {
        params: { variant, locale: preferredReportLanguage },
      });
      setAiReport(response.data);
    },
    onFailed: (snapshot) => snapshot.errorMessage ?? t('dashboard:aiReportGenerationFailed'),
  });

  useEffect(() => {
    setLoading(true);
    setPageError('');
    void (async () => {
      try {
        const res = await client.get(`/profiles/${profileId}/results`);
        setResult(res.data);
        setSelectedAnalysisId(res.data.id);
        setNoResults(false);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setNoResults(true);
          setResult(null);
          setSelectedAnalysisId(null);
        } else {
          setPageError(t('dashboard:failedLoadResults'));
        }
      } finally {
        setLoading(false);
      }
      try {
        await loadHistory();
      } catch {
        setPageError((prev) => prev || t('dashboard:failedLoadHistory'));
      }
      try {
        const matchesResponse = await client.get<TopMatchesResponse>(
          `/profiles/${profileId}/jobs/top-matches`,
          {
            params: { limit: 20 },
          },
        );
        setTopMatches(Array.isArray(matchesResponse.data?.items) ? matchesResponse.data.items : []);
        setTopMatchesAccess(matchesResponse.data?.access ?? null);
      } catch {
        setTopMatches([]);
        setTopMatchesAccess(null);
      }
      await loadBillingStatus();
      const preferences = (await fetchMyPreferences()) as UserPreferences | null;
      if (preferences) {
        setPreferredReportLanguage(preferences.preferredReportLanguage === 'ru' ? 'ru' : 'en');
        setWeeklyStudyHours(preferences.weeklyStudyHours ?? null);
      }
    })();
  }, [loadBillingStatus, loadHistory, profileId, t]);

  const runAnalysis = async () => {
    if (!profileId || analyzing) return;
    setPageError('');
    try {
      await startJob(async () => {
        const startResponse = await client.post(`/jobs/profiles/${profileId}/analyze`);
        return String(startResponse.data.jobId);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('dashboard:analysisFailed');
      setJobError(message);
    }
  };

  const openUpgradeModal = (featureName: string) => {
    setUpgradeFeatureName(featureName);
    setUpgradeError('');
    setUpgradeModalOpened(true);
  };

  const runPremiumUpgrade = async () => {
    setUpgradeLoading(true);
    setUpgradeError('');
    try {
      const urls = buildCheckoutReturnUrls(window.location.pathname, searchParams);
      const checkout = await startPremiumCheckout(urls);
      if (!checkout.checkoutUrl) {
        throw new Error(t('dashboard:checkoutMissingUrl'));
      }
      window.location.assign(checkout.checkoutUrl);
    } catch (err: any) {
      const apiMessage = String(err?.response?.data?.message ?? '').trim();
      setUpgradeError(apiMessage || t('dashboard:upgradeFailed'));
    } finally {
      setUpgradeLoading(false);
    }
  };

  useEffect(() => {
    if (!checkoutAction || !checkoutSessionId) return;

    let canceled = false;
    setCheckoutProcessing(true);
    setPageError('');
    setUpgradeError('');

    void (async () => {
      try {
        const resolved = await pollCheckoutStatus(checkoutSessionId);
        if (canceled) return;

        if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
          setUpgradeModalOpened(false);
          await loadBillingStatus();
          if (profileId) {
            const matchesResponse = await client.get<TopMatchesResponse>(
              `/profiles/${profileId}/jobs/top-matches`,
              { params: { limit: 20 } },
            );
            setTopMatches(
              Array.isArray(matchesResponse.data?.items) ? matchesResponse.data.items : [],
            );
            setTopMatchesAccess(matchesResponse.data?.access ?? null);
          }
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setPageError(t('dashboard:checkoutCanceled'));
        } else if (resolved.paymentStatus === 'PENDING') {
          setPageError(t('dashboard:checkoutPending'));
        } else {
          setPageError(
            resolved.errorMessage ?? t('dashboard:checkoutFailed'),
          );
        }
      } catch (err: any) {
        if (canceled) return;
        const apiMessage = String(err?.response?.data?.message ?? '').trim();
        setPageError(apiMessage || t('dashboard:resolveCheckoutFailed'));
      } finally {
        if (canceled) return;
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [
    checkoutAction,
    checkoutSessionId,
    clearCheckoutParams,
    loadBillingStatus,
    profileId,
    t,
  ]);

  const openHistoricalResult = async (analysisId: string) => {
    if (!profileId) return;
    setPageError('');
    try {
      const res = await client.get(`/profiles/${profileId}/results/${analysisId}`);
      setResult(res.data);
      setSelectedAnalysisId(analysisId);
      setNoResults(false);
    } catch {
      setPageError(t('dashboard:failedOpenSelectedResult'));
    }
  };

  const parseFileName = (contentDisposition: string | undefined, fallback: string) => {
    if (!contentDisposition) return fallback;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    return plainMatch?.[1] ?? fallback;
  };

  const exportReport = async (format: 'pdf' | 'html') => {
    if (!result) return;
    const hasPdfExport = Boolean(
      billingStatus?.entitlements?.features?.PDF_EXPORT?.enabled,
    );
    const hasAiDetailedReport = Boolean(
      billingStatus?.entitlements?.features?.AI_DETAILED_REPORT?.enabled,
    );
    if (format === 'pdf' && !hasPdfExport) {
      openUpgradeModal(t('dashboard:featurePdfExport'));
      return;
    }
    if (reportVariant === 'ai-summary' && !hasAiDetailedReport) {
      openUpgradeModal(t('dashboard:featureAiSummaryReport'));
      return;
    }
    if (reportVariant === 'ai-summary' && !aiReport?.aiSummary) {
      setPageError(t('dashboard:generateAiSummaryFirst'));
      return;
    }
    setExporting(format);
    setPageError('');
    try {
      const response = await client.get(`/reports/analyses/${result.id}/${format}`, {
        params: { variant: reportVariant, locale: preferredReportLanguage },
        responseType: 'blob',
      });
      const suffix = reportVariant === 'ai-summary' ? 'ai-summary' : 'snapshot';
      const fallbackName = `relocation-readiness-${result.id}-${suffix}.${format}`;
      const fileName = parseFileName(response.headers['content-disposition'], fallbackName);
      const href = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(href);
    } catch (err: any) {
      if (err?.response?.data?.code === 'UPGRADE_REQUIRED') {
        openUpgradeModal(t('dashboard:featurePremiumReportExport'));
        return;
      }
      const apiMessage = String(err?.response?.data?.message ?? '').trim();
      setPageError(apiMessage || t('dashboard:failedExport', { format: format.toUpperCase() }));
    } finally {
      setExporting(null);
    }
  };

  const generateAiSummary = async () => {
    if (!result || aiReportLoading) return;
    const hasAiDetailedReport = Boolean(
      billingStatus?.entitlements?.features?.AI_DETAILED_REPORT?.enabled,
    );
    if (!hasAiDetailedReport) {
      openUpgradeModal(t('dashboard:featureAiSummaryReport'));
      return;
    }
    setPageError('');
    setAiJobError('');
    setAiReportRequested(true);
    try {
      await startAiReportJob(async () => {
        const startResponse = await client.post(
          `/jobs/reports/analyses/${result.id}/generate`,
          null,
          { params: { variant: 'ai-summary', format: 'json', locale: preferredReportLanguage } },
        );
        return String(startResponse.data.jobId);
      });
    } catch (err: any) {
      if (err?.response?.data?.code === 'UPGRADE_REQUIRED') {
        openUpgradeModal(t('dashboard:featureAiSummaryReport'));
        return;
      }
      setPageError((prev) => prev || t('dashboard:failedGenerateAiSummary'));
    }
  };

  useEffect(() => {
    setReportVariant('snapshot');
    setAiReport(null);
    setAiReportRequested(false);
  }, [preferredReportLanguage, selectedAnalysisId]);

  useEffect(() => {
    if (!selectedAnalysisId) return;
    void (async () => {
      try {
        const response = await client.get<ReportSnapshotResponse>(
          `/reports/analyses/${selectedAnalysisId}`,
          { params: { variant: 'ai-summary', locale: preferredReportLanguage } },
        );
        if (response.data?.aiSummary) {
          setAiReport(response.data);
          setAiReportRequested(true);
        } else {
          setAiReport(null);
          setAiReportRequested(false);
        }
      } catch {
        setAiReport(null);
        setAiReportRequested(false);
      }
    })();
  }, [selectedAnalysisId]);

  if (loading) return <div className="mt-10 flex justify-center"><Loader color="brand.7" /></div>;

  const error = pageError || jobError || aiJobError;
  const fitScorePct = result ? Math.round(result.fitScore * 100) : 0;
  const analysisByCompetency = new Map(result?.analysisItems.map((item) => [item.competency.id, item]));
  const groupedContributors = result
    ? result.fitScoreContributors.reduce((acc, contributor) => {
        const item = analysisByCompetency.get(contributor.competencyId);
        const priority = item?.priority ?? 'OPTIONAL';
        if (!acc[priority]) acc[priority] = [];
        acc[priority].push(contributor);
        return acc;
      }, {} as Record<string, typeof result.fitScoreContributors>)
    : {};
  const groupOrder = ['CORE', 'IMPORTANT', 'OPTIONAL', 'CONTEXTUAL'];
  const showProgressPanel = analyzing || Boolean(job);
  const aiDetailedEnabled = Boolean(
    billingStatus?.entitlements?.features?.AI_DETAILED_REPORT?.enabled,
  );
  const pdfExportEnabled = Boolean(
    billingStatus?.entitlements?.features?.PDF_EXPORT?.enabled,
  );
  const jobMatchLimit = topMatchesAccess?.maxAllowedLimit ??
    billingStatus?.entitlements?.features?.JOB_MATCH_LIMIT?.limit ??
    null;
  const jobMatchRequestedLimit = topMatchesAccess?.requestedLimit ?? 20;
  const displayedTopMatches = topMatches;
  const isPremiumPlan = billingStatus?.plan.code === 'PREMIUM';

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>{t('dashboard:title')}</Title>
        <Button onClick={runAnalysis} loading={analyzing} color="brand.7">
          {result ? t('dashboard:rerunAnalysis') : t('dashboard:runAnalysis')}
        </Button>
      </Group>
      {checkoutProcessing ? (
        <Alert color="blue">{t('dashboard:processingCheckout')}</Alert>
      ) : null}
      {error && <Alert color="red">{error}</Alert>}
      {result?.marketConfidence?.lowVolumeDetected && result.marketConfidence.warning ? (
        <Alert color={result.marketConfidence.level === 'CRITICAL' ? 'red' : 'yellow'}>
          {result.marketConfidence.warning}
        </Alert>
      ) : null}

      {showProgressPanel && (
        <Paper withBorder radius="lg" p="lg" className="bg-white">
          <JobProgressPanel
            title={t('dashboard:analysisProgress')}
            job={
              job ?? {
                id: 'analysis-running',
                type: 'PROFILE_ANALYSIS',
                status: 'RUNNING',
                currentStep: 'QUEUED',
                progressPercent: 0,
                errorMessage: null,
                payload: null,
                result: null,
                startedAt: null,
                completedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            }
            jobHistory={jobHistory}
            onRetry={runAnalysis}
            retryLabel={t('dashboard:retryAnalysis')}
          />
        </Paper>
      )}

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={3}>{t('dashboard:historyTitle')}</Title>
            {historyLoading ? <Loader size="sm" color="brand.7" /> : null}
          </Group>
          {history.length === 0 && <Text c="dimmed">{t('dashboard:noSavedAnalyses')}</Text>}
          {history.length > 0 && (
            <Accordion variant="separated" radius="md">
              {history.map((item) => (
                <Accordion.Item key={item.id} value={item.id}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="wrap">
                      <Text fw={600}>{new Date(item.createdAt).toLocaleString(language)}</Text>
                      <Badge color="brand.1" variant="light">
                        {t('dashboard:fitBadge')}: {Math.round(item.fitScore * 100)}%
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Text size="sm" c="dimmed">
                        {formatSnapshotContext(item.snapshotMetadata, language, (key, options) =>
                          t(`dashboard:${key}`, options),
                        )}
                      </Text>
                      <Button
                        size="xs"
                        variant={selectedAnalysisId === item.id ? 'light' : 'filled'}
                        color={selectedAnalysisId === item.id ? 'brand.1' : 'brand.7'}
                        onClick={() => openHistoricalResult(item.id)}
                        disabled={selectedAnalysisId === item.id}
                        w="fit-content"
                      >
                        {selectedAnalysisId === item.id
                          ? t('dashboard:opened')
                          : t('dashboard:open')}
                      </Button>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Stack>
      </Card>
      {profileId ? <LegalReadinessCard profileId={profileId} /> : null}
      {profileId ? <FinancialReadinessCard profileId={profileId} /> : null}

      {noResults && !result && !analyzing && (
        <Paper withBorder radius="lg" p="xl" className="bg-white text-center">
          <Stack align="center">
            <Text>{t('dashboard:noAnalysisResults')}</Text>
            <Button onClick={runAnalysis} color="brand.7">
              {t('dashboard:runAnalysis')}
            </Button>
          </Stack>
        </Paper>
      )}

      {result && (
        <>
          <Card withBorder radius="lg" p="xl" className="bg-white">
            <Tabs value={reportVariant} onChange={(value) => setReportVariant((value as ReportVariant) ?? 'snapshot')}>
              <Tabs.List>
                <Tabs.Tab value="snapshot">{t('dashboard:profileSnapshotNoAi')}</Tabs.Tab>
                <Tabs.Tab value="ai-summary">
                  <Group gap={6} wrap="nowrap">
                    <span>{t('dashboard:aiSummary')}</span>
                    <Badge size="xs" variant="light" color="grape">
                      {t('common:premium', { ns: 'common' })}
                    </Badge>
                  </Group>
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="snapshot" pt="lg">
                <Stack align="center" gap="sm">
                  <Title order={3}>{t('dashboard:fitScore')}</Title>
                  <Text fz="3rem" fw={700} c={`${scoreColor(fitScorePct)}.7`}>{fitScorePct}%</Text>
                  <Text ta="center" c="dimmed" maw={760}>
                    {t(`dashboard:${getFitScoreMessageKey(fitScorePct)}`)}
                  </Text>
                  <Text c="dimmed">
                    {t('dashboard:criticalPathEstimate', { months: result.totalPrepMonths })}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {formatSnapshotContext(result.snapshotMetadata, language, (key, options) =>
                      t(`dashboard:${key}`, options),
                    )}
                  </Text>
                  <Group gap="xs">
                    <Button onClick={() => exportReport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} color="brand.7">
                      {t('dashboard:savePdf')}
                    </Button>
                    <Badge size="sm" variant="light" color="grape">
                      {t('common:premium', { ns: 'common' })}
                    </Badge>
                    <Button onClick={() => exportReport('html')} loading={exporting === 'html'} disabled={exporting !== null} variant="outline" color="brand.8">
                      {t('dashboard:saveHtml')}
                    </Button>
                  </Group>
                  {!pdfExportEnabled ? (
                    <Text size="sm" c="dimmed">
                      {t('dashboard:pdfOnPremiumHint')}
                    </Text>
                  ) : null}
                  <SkillFitRadarChart items={result.analysisItems} />
                  {result.timeEstimate && (
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm" w="100%" maw={820}>
                      <Badge size="lg" variant="light" color="brand.1">
                        {t('dashboard:optimistic')}: {result.timeEstimate.optimisticHours}h
                      </Badge>
                      <Badge size="lg" variant="light" color="brand.1">
                        {t('dashboard:realistic')}: {result.timeEstimate.realisticHours}h
                      </Badge>
                      <Badge size="lg" variant="light" color="brand.1">
                        {t('dashboard:criticalPath')}: {result.timeEstimate.criticalPathHours}h
                      </Badge>
                    </SimpleGrid>
                  )}
                  {result.timeEstimate && weeklyStudyHours ? (
                    <Text size="sm" c="dimmed">
                      {t('dashboard:realisticPaceWeeks', {
                        weeklyHours: weeklyStudyHours,
                        weeks: Math.max(1, Math.ceil(result.timeEstimate.realisticHours / weeklyStudyHours)),
                      })}
                    </Text>
                  ) : null}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="ai-summary" pt="lg">
                <Stack gap="sm">
                  <Group justify="space-between" wrap="wrap">
                    <Title order={3}>{t('dashboard:aiSummaryReport')}</Title>
                    <Group>
                      <Button
                        onClick={() => exportReport('pdf')}
                        loading={exporting === 'pdf'}
                        disabled={exporting !== null || aiReportLoading || !aiReport?.aiSummary}
                        color="brand.7"
                      >
                        {t('dashboard:savePdf')}
                      </Button>
                      <Button
                        onClick={() => exportReport('html')}
                        loading={exporting === 'html'}
                        disabled={exporting !== null || aiReportLoading || !aiReport?.aiSummary}
                        variant="outline"
                        color="brand.8"
                      >
                        {t('dashboard:saveHtml')}
                      </Button>
                    </Group>
                  </Group>
                  {!aiDetailedEnabled && (
                    <Alert color="yellow">
                      {t('dashboard:aiDetailedLocked')}
                      <Group mt="xs">
                        <Button
                          size="xs"
                          color="brand.7"
                          onClick={() => openUpgradeModal(t('dashboard:featureAiDetailedReport'))}
                        >
                          {t('dashboard:upgrade')}
                        </Button>
                      </Group>
                    </Alert>
                  )}
                  <Group gap="xs" w="fit-content">
                    <Button
                      onClick={generateAiSummary}
                      loading={aiReportLoading}
                      disabled={aiReportLoading || !result}
                      color="brand.7"
                      w="fit-content"
                    >
                      {aiReport ? t('dashboard:regenerateAiSummary') : t('dashboard:generateAiSummary')}
                    </Button>
                    <Badge size="sm" variant="light" color="grape">
                      {t('common:premium', { ns: 'common' })}
                    </Badge>
                  </Group>
                  {aiReportLoading && <Loader color="brand.7" size="sm" />}
                  {(aiReportLoading || aiReportJob) && (
                    <JobProgressPanel
                      title={t('dashboard:aiReportGenerationProgress')}
                      job={
                        aiReportJob ?? {
                          id: 'report-generation-running',
                          type: 'REPORT_GENERATION',
                          status: 'RUNNING',
                          currentStep: 'QUEUED',
                          progressPercent: 0,
                          errorMessage: null,
                          payload: null,
                          result: null,
                          startedAt: null,
                          completedAt: null,
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        }
                      }
                      jobHistory={aiReportJobHistory}
                      onRetry={generateAiSummary}
                      retryLabel={t('dashboard:retryAiSummary')}
                    />
                  )}
                  {!aiReportLoading && !aiReportRequested && (
                    <Text size="sm" c="dimmed">
                      {t('dashboard:aiSummaryOnRequest')}
                    </Text>
                  )}
                  {!aiReportLoading && aiReport?.aiSummaryMeta && (
                    <Text size="sm" c="dimmed">
                      {t('dashboard:provider')}: {aiReport.aiSummaryMeta.providerUsed} ({aiReport.aiSummaryMeta.modelUsed})
                      {aiReport.aiSummaryMeta.fallbackUsed ? t('dashboard:viaFallbackChain') : ''}
                    </Text>
                  )}
                  {!aiReportLoading && !aiReport?.aiSummary && (
                    <Alert color="yellow">
                      {t('dashboard:aiSummaryUnavailable')}
                    </Alert>
                  )}
                  {!aiReportLoading && aiReport?.aiSummary && (
                    <>
                      <Card withBorder radius="md" p="sm">
                        <Text fw={700}>{t('dashboard:executiveSummary')}</Text>
                        <Text size="sm">{aiReport.aiSummary.executiveSummary}</Text>
                      </Card>
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        <Card withBorder radius="md" p="sm">
                          <Text fw={700}>{t('dashboard:topStrengths')}</Text>
                          <Stack gap={4} mt={6}>
                            {aiReport.aiSummary.topStrengths.map((item, idx) => (
                              <Text key={`strength-${idx}`} size="sm">- {item}</Text>
                            ))}
                          </Stack>
                        </Card>
                        <Card withBorder radius="md" p="sm">
                          <Text fw={700}>{t('dashboard:topRisks')}</Text>
                          <Stack gap={4} mt={6}>
                            {aiReport.aiSummary.topRisks.map((item, idx) => (
                              <Text key={`risk-${idx}`} size="sm">- {item}</Text>
                            ))}
                          </Stack>
                        </Card>
                      </SimpleGrid>
                      <Card withBorder radius="md" p="sm">
                        <Text fw={700}>{t('dashboard:recommendedStrategy')}</Text>
                        <Text size="sm">{aiReport.aiSummary.recommendedStrategy}</Text>
                      </Card>
                      <Text size="xs" c="dimmed">{aiReport.aiSummary.advisoryDisclaimer}</Text>
                    </>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Title order={3}>{t('dashboard:fitScoreContributors')}</Title>
              <Text size="sm" c="dimmed">{t('dashboard:contributorsHint')}</Text>
              {groupOrder.map((group) => {
                const contributors = groupedContributors[group] ?? [];
                if (contributors.length === 0) return null;
                return (
                  <Stack key={group} gap="xs">
                    <Text fw={700}>{priorityLabel[group] ?? formatEnumLabel(group)}</Text>
                    {contributors.map((contributor) => {
                      const item = analysisByCompetency.get(contributor.competencyId);
                      const currentPct = Math.round(
                        (Number(item?.normalizedCurrentScore ?? contributor.matchScore) || 0) * 100,
                      );
                      const expectedPct = Math.round(
                        (Number(item?.normalizedRequiredScore ?? 1) || 0) * 100,
                      );
                      const matchPct = Math.round((Number(contributor.matchScore) || 0) * 100);
                      return (
                        <Card key={contributor.competencyId} withBorder radius="md" p="sm">
                          <Stack gap={6}>
                            <Group justify="space-between" wrap="wrap">
                              <Text>{contributor.competencyName}</Text>
                              <Text size="sm" c="dimmed">{currentPct}/{expectedPct}%</Text>
                            </Group>
                            <Progress value={currentPct} color={scoreColor(matchPct)} />
                            <Progress value={expectedPct} color="dark" />
                          </Stack>
                        </Card>
                      );
                    })}
                  </Stack>
                );
              })}
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Title order={3}>{t('dashboard:actionableGaps')}</Title>
              {result.actionableGaps.length === 0 && (
                <Text c="dimmed">{t('dashboard:noActionableGaps')}</Text>
              )}
              {result.actionableGaps.map((gap) => (
                <Card key={gap.competency.id} withBorder radius="md" p="sm">
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="wrap">
                      <Text fw={600}>{gap.competency.name}</Text>
                      <Badge variant="light" color="brand.1">
                        {gap.currentLevel} {'->'} {gap.requiredLevel}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {formatEnumLabel(gap.priority)} / {formatEnumLabel(gap.roleRelevance)} / {formatEnumLabel(gap.recommendationType)}
                    </Text>
                    <Text size="sm">{gap.reason}</Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Card>

          <Button component={RouterLink} to={`/progress/${profileId}`} color="brand.7" w="fit-content">
            {t('dashboard:viewProgressTracker')}
          </Button>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Group justify="space-between" wrap="wrap">
                <Title order={3}>Job postings for you</Title>
                <Group gap="xs">
                  {jobMatchLimit ? (
                    <Badge color="gray" variant="light">
                      Showing {jobMatchLimit} of {jobMatchRequestedLimit}
                    </Badge>
                  ) : null}
                  <Badge color="grape" variant="light">
                    Premium: up to 20
                  </Badge>
                </Group>
              </Group>
              {topMatchesAccess?.upgradeRequired ? (
                <Alert color="yellow">
                  Current plan allows {topMatchesAccess.maxAllowedLimit ?? 0} job postings.
                  {' '}
                  Premium unlocks up to {topMatchesAccess.requestedLimit} job postings.
                  <Group mt="xs">
                    <Button
                      size="xs"
                      color="brand.7"
                      onClick={() => openUpgradeModal(t('dashboard:featureExpandedJobMatching'))}
                    >
                      {t('dashboard:upgrade')}
                    </Button>
                  </Group>
                </Alert>
              ) : null}
              {!topMatchesAccess?.upgradeRequired ? (
                <Alert color="blue">
                  {isPremiumPlan
                    ? 'Browse the full jobs catalog in the Jobs tab.'
                    : 'Upgrade to Premium to unlock the full jobs catalog in the Jobs tab.'}
                </Alert>
              ) : null}
              {topMatches.length === 0 && (
                <Text c="dimmed">{t('dashboard:noMatchingVacancies')}</Text>
              )}
              {displayedTopMatches.map((match) => (
                <Card key={match.posting.id} withBorder radius="md" p="sm">
                  <Stack gap={6}>
                    <Text fw={700}>{match.posting.title}</Text>
                    {extractPostingCity(match.posting.location) ? (
                      <Text size="sm" c="dimmed">{extractPostingCity(match.posting.location)}</Text>
                    ) : null}
                    {match.posting.sourceUrl ? (
                      <Button
                        component="a"
                        href={match.posting.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        size="xs"
                        variant="outline"
                        color="brand.8"
                        w="fit-content"
                      >
                        {t('dashboard:openVacancy')}
                      </Button>
                    ) : null}
                  </Stack>
                </Card>
              ))}
              {topMatches.length > 0 ? (
                <Group>
                  {isPremiumPlan ? (
                    <Button
                      component={RouterLink}
                      to="/jobs"
                      size="sm"
                      variant="outline"
                      color="brand.8"
                    >
                      Browse Jobs Catalog
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      color="grape"
                      onClick={() => openUpgradeModal(t('dashboard:featureExpandedJobMatching'))}
                    >
                      Browse Jobs Catalog
                    </Button>
                  )}
                </Group>
              ) : null}
            </Stack>
          </Card>

          <PremiumUpgradeModal
            opened={upgradeModalOpened}
            onClose={() => setUpgradeModalOpened(false)}
            onUpgrade={runPremiumUpgrade}
            loading={upgradeLoading}
            featureName={upgradeFeatureName}
            errorMessage={upgradeError || null}
          />
        </>
      )}
    </Stack>
  );
}


