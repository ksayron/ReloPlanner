import { useCallback, useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
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
import client from '../api/client';
import JobProgressPanel from '../components/JobProgressPanel';
import type {
  AnalysisHistoryItem,
  AnalysisResult,
  JobMatchResult,
  ProcessingJobSnapshot,
  ReportSnapshotResponse,
  ReportVariant,
} from '../types';
import { usePersistentJobStream } from '../hooks/usePersistentJobStream';
import { formatEnumLabel, getJobStepLabel } from '../utils/jobProgress';

const priorityLabel: Record<string, string> = {
  CORE: 'Critical',
  IMPORTANT: 'Important',
  OPTIONAL: 'Nice to Have',
  CONTEXTUAL: 'Contextual',
};

const getFitScoreMessage = (scorePct: number) => {
  if (scorePct >= 80) return 'Strong readiness for your target role/market. Focus on polishing targeted gaps to improve competitiveness.';
  if (scorePct >= 60) return 'Moderate readiness. You already match part of the market expectation, but important gaps still impact hiring chances.';
  if (scorePct >= 40) return 'Early-to-mid readiness. You need focused upskilling on core requirements before the profile is market-competitive.';
  return 'Low readiness for current target settings. Start with core skills and critical prerequisites to build a viable path.';
};

const scoreColor = (score: number) => {
  if (score >= 70) return 'teal';
  if (score >= 40) return 'yellow';
  return 'red';
};

const formatSnapshotContext = (snapshot: AnalysisHistoryItem['snapshotMetadata']) => {
  if (!snapshot) {
    return 'Based on unavailable market snapshot metadata.';
  }

  const vacancies = Number.isFinite(snapshot.totalVacancies)
    ? snapshot.totalVacancies.toLocaleString()
    : 'unknown';
  const location = snapshot.city
    ? `${snapshot.city}, ${snapshot.country}`
    : snapshot.country;
  const source = snapshot.source || 'unknown source';
  const snapshotDate = snapshot.snapshotDate
    ? new Date(snapshot.snapshotDate).toLocaleDateString()
    : 'unknown date';

  return `Based on ${vacancies} vacancies in ${location} (${source}, ${snapshotDate}).`;
};

export default function Dashboard() {
  const { profileId } = useParams<{ profileId: string }>();
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
    streamDisconnectedMessage: 'Live progress stream disconnected',
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
    onFailed: (snapshot) => snapshot.errorMessage ?? `Analysis failed at step: ${getJobStepLabel(snapshot.currentStep)}`,
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
    streamDisconnectedMessage: 'AI report generation stream disconnected',
    hideCompletedAfterMs: 5000,
    loadActiveJob: loadActiveReportJob,
    onCompleted: async (snapshot) => {
      const payload = snapshot.result as { analysisId?: string; variant?: ReportVariant } | null;
      const analysisId = payload?.analysisId ?? selectedAnalysisId;
      if (!analysisId) return;
      const variant = payload?.variant === 'ai-summary' ? 'ai-summary' : 'snapshot';
      const response = await client.get<ReportSnapshotResponse>(`/reports/analyses/${analysisId}`, {
        params: { variant },
      });
      setAiReport(response.data);
    },
    onFailed: (snapshot) => snapshot.errorMessage ?? 'AI report generation failed',
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
          setPageError('Failed to load results');
        }
      } finally {
        setLoading(false);
      }
      try {
        await loadHistory();
      } catch {
        setPageError((prev) => prev || 'Failed to load analysis history');
      }
      try {
        const matchesResponse = await client.get(`/profiles/${profileId}/jobs/top-matches`, {
          params: { limit: 3 },
        });
        setTopMatches(Array.isArray(matchesResponse.data?.items) ? matchesResponse.data.items : []);
      } catch {
        setTopMatches([]);
      }
    })();
  }, [loadHistory, profileId]);

  const runAnalysis = async () => {
    if (!profileId || analyzing) return;
    setPageError('');
    try {
      await startJob(async () => {
        const startResponse = await client.post(`/jobs/profiles/${profileId}/analyze`);
        return String(startResponse.data.jobId);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setJobError(message);
    }
  };

  const openHistoricalResult = async (analysisId: string) => {
    if (!profileId) return;
    setPageError('');
    try {
      const res = await client.get(`/profiles/${profileId}/results/${analysisId}`);
      setResult(res.data);
      setSelectedAnalysisId(analysisId);
      setNoResults(false);
    } catch {
      setPageError('Failed to open selected analysis result');
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
    if (reportVariant === 'ai-summary' && !aiReport?.aiSummary) {
      setPageError('Generate AI summary first, then export.');
      return;
    }
    setExporting(format);
    setPageError('');
    try {
      const response = await client.get(`/reports/analyses/${result.id}/${format}`, {
        params: { variant: reportVariant },
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
      const apiMessage = String(err?.response?.data?.message ?? '').trim();
      setPageError(apiMessage || `Failed to export ${format.toUpperCase()} report`);
    } finally {
      setExporting(null);
    }
  };

  const generateAiSummary = async () => {
    if (!result || aiReportLoading) return;
    setPageError('');
    setAiJobError('');
    setAiReportRequested(true);
    try {
      await startAiReportJob(async () => {
        const startResponse = await client.post(
          `/jobs/reports/analyses/${result.id}/generate`,
          null,
          { params: { variant: 'ai-summary', format: 'json' } },
        );
        return String(startResponse.data.jobId);
      });
    } catch {
      setPageError((prev) => prev || 'Failed to generate AI summary report');
    }
  };

  useEffect(() => {
    setReportVariant('snapshot');
    setAiReport(null);
    setAiReportRequested(false);
  }, [selectedAnalysisId]);

  useEffect(() => {
    if (!selectedAnalysisId) return;
    void (async () => {
      try {
        const response = await client.get<ReportSnapshotResponse>(
          `/reports/analyses/${selectedAnalysisId}`,
          { params: { variant: 'ai-summary' } },
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

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Analysis Dashboard</Title>
        <Button onClick={runAnalysis} loading={analyzing} color="brand.7">{result ? 'Re-run Analysis' : 'Run Analysis'}</Button>
      </Group>
      {error && <Alert color="red">{error}</Alert>}
      {result?.marketConfidence?.lowVolumeDetected && result.marketConfidence.warning ? (
        <Alert color={result.marketConfidence.level === 'CRITICAL' ? 'red' : 'yellow'}>
          {result.marketConfidence.warning}
        </Alert>
      ) : null}

      {showProgressPanel && (
        <Paper withBorder radius="lg" p="lg" className="bg-white">
          <JobProgressPanel
            title="Analysis Progress"
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
            retryLabel="Retry Analysis"
          />
        </Paper>
      )}

      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Group justify="space-between" align="center" wrap="wrap">
            <Title order={3}>Analysis History</Title>
            {historyLoading ? <Loader size="sm" color="brand.7" /> : null}
          </Group>
          {history.length === 0 && <Text c="dimmed">No saved analyses yet.</Text>}
          {history.length > 0 && (
            <Accordion variant="separated" radius="md">
              {history.map((item) => (
                <Accordion.Item key={item.id} value={item.id}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="wrap">
                      <Text fw={600}>{new Date(item.createdAt).toLocaleString()}</Text>
                      <Badge color="brand.1" variant="light">
                        Fit: {Math.round(item.fitScore * 100)}%
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Text size="sm" c="dimmed">{formatSnapshotContext(item.snapshotMetadata)}</Text>
                      <Button
                        size="xs"
                        variant={selectedAnalysisId === item.id ? 'light' : 'filled'}
                        color={selectedAnalysisId === item.id ? 'brand.1' : 'brand.7'}
                        onClick={() => openHistoricalResult(item.id)}
                        disabled={selectedAnalysisId === item.id}
                        w="fit-content"
                      >
                        {selectedAnalysisId === item.id ? 'Opened' : 'Open'}
                      </Button>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Stack>
      </Card>

      {noResults && !result && !analyzing && <Paper withBorder radius="lg" p="xl" className="bg-white text-center"><Stack align="center"><Text>No analysis results yet.</Text><Button onClick={runAnalysis} color="brand.7">Run Analysis</Button></Stack></Paper>}

      {result && (
        <>
          <Card withBorder radius="lg" p="xl" className="bg-white">
            <Tabs value={reportVariant} onChange={(value) => setReportVariant((value as ReportVariant) ?? 'snapshot')}>
              <Tabs.List>
                <Tabs.Tab value="snapshot">Profile Snapshot (No AI)</Tabs.Tab>
                <Tabs.Tab value="ai-summary">AI Summary</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="snapshot" pt="lg">
                <Stack align="center" gap="sm">
                  <Title order={3}>Fit Score</Title>
                  <Text fz="3rem" fw={700} c={`${scoreColor(fitScorePct)}.7`}>{fitScorePct}%</Text>
                  <Text ta="center" c="dimmed" maw={760}>{getFitScoreMessage(fitScorePct)}</Text>
                  <Text c="dimmed">Critical-path estimate: {result.totalPrepMonths} months</Text>
                  <Text size="sm" c="dimmed">{formatSnapshotContext(result.snapshotMetadata)}</Text>
                  <Group>
                    <Button onClick={() => exportReport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} color="brand.7">Save as PDF</Button>
                    <Button onClick={() => exportReport('html')} loading={exporting === 'html'} disabled={exporting !== null} variant="outline" color="brand.8">Save as HTML</Button>
                  </Group>
                  {result.timeEstimate && <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm" w="100%" maw={820}><Badge size="lg" variant="light" color="brand.1">Optimistic: {result.timeEstimate.optimisticHours}h</Badge><Badge size="lg" variant="light" color="brand.1">Realistic: {result.timeEstimate.realisticHours}h</Badge><Badge size="lg" variant="light" color="brand.1">Critical Path: {result.timeEstimate.criticalPathHours}h</Badge></SimpleGrid>}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="ai-summary" pt="lg">
                <Stack gap="sm">
                  <Group justify="space-between" wrap="wrap">
                    <Title order={3}>AI Summary Report</Title>
                    <Group>
                      <Button
                        onClick={() => exportReport('pdf')}
                        loading={exporting === 'pdf'}
                        disabled={exporting !== null || aiReportLoading || !aiReport?.aiSummary}
                        color="brand.7"
                      >
                        Save as PDF
                      </Button>
                      <Button
                        onClick={() => exportReport('html')}
                        loading={exporting === 'html'}
                        disabled={exporting !== null || aiReportLoading || !aiReport?.aiSummary}
                        variant="outline"
                        color="brand.8"
                      >
                        Save as HTML
                      </Button>
                    </Group>
                  </Group>
                  <Button
                    onClick={generateAiSummary}
                    loading={aiReportLoading}
                    disabled={aiReportLoading || !result}
                    color="brand.7"
                    w="fit-content"
                  >
                    {aiReport ? 'Regenerate AI Summary' : 'Generate AI Summary'}
                  </Button>
                  {aiReportLoading && <Loader color="brand.7" size="sm" />}
                  {(aiReportLoading || aiReportJob) && (
                    <JobProgressPanel
                      title="AI Report Generation Progress"
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
                      retryLabel="Retry AI Summary"
                    />
                  )}
                  {!aiReportLoading && !aiReportRequested && (
                    <Text size="sm" c="dimmed">
                      AI summary is generated only on explicit request.
                    </Text>
                  )}
                  {!aiReportLoading && aiReport?.aiSummaryMeta && (
                    <Text size="sm" c="dimmed">
                      Provider: {aiReport.aiSummaryMeta.providerUsed} ({aiReport.aiSummaryMeta.modelUsed})
                      {aiReport.aiSummaryMeta.fallbackUsed ? ' via fallback chain' : ''}
                    </Text>
                  )}
                  {!aiReportLoading && !aiReport?.aiSummary && (
                    <Alert color="yellow">
                      AI summary is unavailable right now. Snapshot export remains available.
                    </Alert>
                  )}
                  {!aiReportLoading && aiReport?.aiSummary && (
                    <>
                      <Card withBorder radius="md" p="sm">
                        <Text fw={700}>Executive Summary</Text>
                        <Text size="sm">{aiReport.aiSummary.executiveSummary}</Text>
                      </Card>
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        <Card withBorder radius="md" p="sm">
                          <Text fw={700}>Top Strengths</Text>
                          <Stack gap={4} mt={6}>
                            {aiReport.aiSummary.topStrengths.map((item, idx) => (
                              <Text key={`strength-${idx}`} size="sm">- {item}</Text>
                            ))}
                          </Stack>
                        </Card>
                        <Card withBorder radius="md" p="sm">
                          <Text fw={700}>Top Risks</Text>
                          <Stack gap={4} mt={6}>
                            {aiReport.aiSummary.topRisks.map((item, idx) => (
                              <Text key={`risk-${idx}`} size="sm">- {item}</Text>
                            ))}
                          </Stack>
                        </Card>
                      </SimpleGrid>
                      <Card withBorder radius="md" p="sm">
                        <Text fw={700}>Recommended Strategy</Text>
                        <Text size="sm">{aiReport.aiSummary.recommendedStrategy}</Text>
                      </Card>
                      <Text size="xs" c="dimmed">{aiReport.aiSummary.advisoryDisclaimer}</Text>
                    </>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white"><Stack><Title order={3}>Fit Score Contributors</Title><Text size="sm" c="dimmed">Top bar: your current level. Bottom bar: expected target level for this competency.</Text>{groupOrder.map((group) => { const contributors = groupedContributors[group] ?? []; if (contributors.length === 0) return null; return <Stack key={group} gap="xs"><Text fw={700}>{priorityLabel[group] ?? formatEnumLabel(group)}</Text>{contributors.map((contributor) => { const item = analysisByCompetency.get(contributor.competencyId); const currentPct = Math.round((Number(item?.normalizedCurrentScore ?? contributor.matchScore) || 0) * 100); const expectedPct = Math.round((Number(item?.normalizedRequiredScore ?? 1) || 0) * 100); const matchPct = Math.round((Number(contributor.matchScore) || 0) * 100); return <Card key={contributor.competencyId} withBorder radius="md" p="sm"><Stack gap={6}><Group justify="space-between" wrap="wrap"><Text>{contributor.competencyName}</Text><Text size="sm" c="dimmed">{currentPct}/{expectedPct}%</Text></Group><Progress value={currentPct} color={scoreColor(matchPct)} /><Progress value={expectedPct} color="dark" /></Stack></Card>; })}</Stack>; })}</Stack></Card>

          <Card withBorder radius="lg" p="lg" className="bg-white"><Stack><Title order={3}>Actionable Gaps</Title>{result.actionableGaps.length === 0 && <Text c="dimmed">No actionable gaps identified.</Text>}{result.actionableGaps.map((gap) => <Card key={gap.competency.id} withBorder radius="md" p="sm"><Stack gap={4}><Group justify="space-between" wrap="wrap"><Text fw={600}>{gap.competency.name}</Text><Badge variant="light" color="brand.1">{gap.currentLevel} to {gap.requiredLevel}</Badge></Group><Text size="sm" c="dimmed">{formatEnumLabel(gap.priority)} / {formatEnumLabel(gap.roleRelevance)} / {formatEnumLabel(gap.recommendationType)}</Text><Text size="sm">{gap.reason}</Text></Stack></Card>)}</Stack></Card>

          <Card withBorder radius="lg" p="lg" className="bg-white"><Stack><Title order={3}>Market Context / Exclusions</Title>{result.marketContext.map((item) => <Card key={item.competency.id} withBorder radius="md" p="sm"><Stack gap={4}><Text fw={600}>{item.competency.name} - {formatEnumLabel(item.recommendationType)}</Text><Text size="sm" c="dimmed">{item.reason}</Text></Stack></Card>)}</Stack></Card>

          <Button component={RouterLink} to={`/progress/${profileId}`} color="brand.7" w="fit-content">View Progress Tracker</Button>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Title order={3}>Top Matching Jobs</Title>
              {topMatches.length === 0 && (
                <Text c="dimmed">No matching vacancies found yet for your current role/country profile.</Text>
              )}
              {topMatches.map((match) => (
                <Card key={match.posting.id} withBorder radius="md" p="sm">
                  <Stack gap={6}>
                    <Group justify="space-between" wrap="wrap">
                      <Text fw={700}>{match.posting.title}</Text>
                      <Badge color="brand.1" variant="light">{Math.round(match.score * 100)}%</Badge>
                    </Group>
                    <Text size="sm">{match.posting.company} - {match.posting.location}</Text>
                    <Text size="sm" c="dimmed">
                      {match.posting.salaryMinUsd && match.posting.salaryMaxUsd
                        ? `${match.posting.salaryMinUsd.toLocaleString()}-${match.posting.salaryMaxUsd.toLocaleString()} ${match.posting.salaryCurrency ?? 'USD'}`
                        : 'Salary not specified'}
                    </Text>
                    <Text size="sm">{match.rationale}</Text>
                    <Text size="xs" c="dimmed">
                      Matched: {match.matchedSkills.slice(0, 3).join(', ') || 'none'} | Missing: {match.missingSkills.slice(0, 3).join(', ') || 'none'}
                    </Text>
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
                        Open vacancy
                      </Button>
                    ) : null}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}

