import { useState, useEffect, useRef } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
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
  Text,
  Title,
} from '@mantine/core';
import client from '../api/client';
import type { AnalysisResult, ProcessingJobSnapshot } from '../types';
import {
  formatEnumLabel,
  getJobStepLabel,
  isTerminalJobStatus,
} from '../utils/jobProgress';

const priorityLabel: Record<string, string> = {
  CORE: 'Critical',
  IMPORTANT: 'Important',
  OPTIONAL: 'Nice to Have',
  CONTEXTUAL: 'Contextual',
};

const getFitScoreMessage = (scorePct: number) => {
  if (scorePct >= 80) {
    return 'Strong readiness for your target role/market. Focus on polishing targeted gaps to improve competitiveness.';
  }
  if (scorePct >= 60) {
    return 'Moderate readiness. You already match part of the market expectation, but important gaps still impact hiring chances.';
  }
  if (scorePct >= 40) {
    return 'Early-to-mid readiness. You need focused upskilling on core requirements before the profile is market-competitive.';
  }
  return 'Low readiness for current target settings. Start with core skills and critical prerequisites to build a viable path.';
};

const scoreColor = (score: number) => {
  if (score >= 70) return 'teal';
  if (score >= 40) return 'yellow';
  return 'red';
};

export default function Dashboard() {
  const { profileId } = useParams<{ profileId: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [job, setJob] = useState<ProcessingJobSnapshot | null>(null);
  const [jobHistory, setJobHistory] = useState<ProcessingJobSnapshot[]>([]);
  const [exporting, setExporting] = useState<'pdf' | 'html' | null>(null);
  const [noResults, setNoResults] = useState(false);
  const [error, setError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setLoading(true);
    client
      .get(`/profiles/${profileId}/results`)
      .then((res) => {
        setResult(res.data);
        setNoResults(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNoResults(true);
        else setError('Failed to load results');
      })
      .finally(() => setLoading(false));
  }, [profileId]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const closeJobStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const parseSseSnapshot = (raw: string): ProcessingJobSnapshot | null => {
    try {
      return JSON.parse(raw) as ProcessingJobSnapshot;
    } catch {
      return null;
    }
  };

  const applyJobSnapshot = async (snapshot: ProcessingJobSnapshot, finishedRef: { done: boolean }) => {
    setJob(snapshot);
    setJobHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.currentStep === snapshot.currentStep &&
        last.status === snapshot.status &&
        last.progressPercent === snapshot.progressPercent &&
        last.errorMessage === snapshot.errorMessage
      ) {
        return prev;
      }
      return [...prev, snapshot];
    });

    if (!isTerminalJobStatus(snapshot.status) || finishedRef.done) return;

    finishedRef.done = true;
    closeJobStream();
    setAnalyzing(false);

    if (snapshot.status === 'COMPLETED') {
      const res = await client.get(`/profiles/${profileId}/results`);
      setResult(res.data);
      setNoResults(false);
      return;
    }

    const failedStep = getJobStepLabel(snapshot.currentStep);
    setError(snapshot.errorMessage ?? `Analysis failed at step: ${failedStep}`);
  };

  const runAnalysis = async () => {
    if (!profileId || analyzing) return;

    closeJobStream();
    setAnalyzing(true);
    setError('');
    setJob(null);
    setJobHistory([]);

    const finishedRef = { done: false };

    try {
      const startResponse = await client.post(`/jobs/profiles/${profileId}/analyze`);
      const jobId = String(startResponse.data.jobId);

      const statusResponse = await client.get(`/jobs/${jobId}`);
      await applyJobSnapshot(statusResponse.data as ProcessingJobSnapshot, finishedRef);

      if (finishedRef.done) return;

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Missing auth token for SSE connection');
      }

      const eventSource = new EventSource(`/api/jobs/${jobId}/events?access_token=${encodeURIComponent(token)}`);
      eventSourceRef.current = eventSource;

      const onSnapshotEvent = (event: MessageEvent<string>) => {
        const snapshot = parseSseSnapshot(event.data);
        if (!snapshot) return;
        void applyJobSnapshot(snapshot, finishedRef).catch(() => {
          setError('Analysis failed while processing progress updates');
        });
      };

      eventSource.onmessage = onSnapshotEvent;
      eventSource.addEventListener('job.update', onSnapshotEvent as EventListener);

      eventSource.onerror = () => {
        if (finishedRef.done) return;
        setError('Live progress stream disconnected');
        setAnalyzing(false);
        closeJobStream();
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      setAnalyzing(false);
      closeJobStream();
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
    setExporting(format);
    setError('');
    try {
      const response = await client.get(`/reports/analyses/${result.id}/${format}`, {
        responseType: 'blob',
      });
      const fallbackName = `relocation-readiness-${result.id}.${format}`;
      const fileName = parseFileName(response.headers['content-disposition'], fallbackName);
      const href = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(href);
    } catch {
      setError(`Failed to export ${format.toUpperCase()} report`);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  const fitScorePct = result ? Math.round(result.fitScore * 100) : 0;
  const analysisByCompetency = new Map(result?.analysisItems.map((item) => [item.competency.id, item]));
  const groupedContributors = result
    ? result.fitScoreContributors.reduce(
        (acc, contributor) => {
          const item = analysisByCompetency.get(contributor.competencyId);
          const priority = item?.priority ?? 'OPTIONAL';
          if (!acc[priority]) acc[priority] = [];
          acc[priority].push(contributor);
          return acc;
        },
        {} as Record<string, typeof result.fitScoreContributors>,
      )
    : {};
  const groupOrder = ['CORE', 'IMPORTANT', 'OPTIONAL', 'CONTEXTUAL'];

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Analysis Dashboard</Title>
        <Button onClick={runAnalysis} loading={analyzing} color="brand.7">
          {result ? 'Re-run Analysis' : 'Run Analysis'}
        </Button>
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {(analyzing || job) && (
        <Paper withBorder radius="lg" p="lg" className="bg-white">
          <Stack gap="sm">
            <Title order={3}>Analysis Progress</Title>
            <Text>Status: <strong>{job ? formatEnumLabel(job.status) : 'Running'}</strong></Text>
            <Text>
              Current step: <strong>{job ? getJobStepLabel(job.currentStep) : 'Queued'}</strong>
            </Text>
            <Progress value={Math.max(0, Math.min(100, job?.progressPercent ?? 0))} color={job?.status === 'FAILED' ? 'red' : 'teal'} />
            <Text size="sm" c="dimmed">{job?.progressPercent ?? 0}% complete</Text>

            {jobHistory.length > 0 && (
              <Stack gap={4}>
                {jobHistory.map((item, idx) => {
                  const itemColor = item.status === 'FAILED' ? 'red' : item.status === 'COMPLETED' ? 'teal' : 'dark';
                  return (
                    <Group key={`${item.currentStep}-${item.progressPercent}-${idx}`} justify="space-between">
                      <Text c={itemColor}>{getJobStepLabel(item.currentStep)}</Text>
                      <Text size="sm" c="dimmed">{item.progressPercent}%</Text>
                    </Group>
                  );
                })}
              </Stack>
            )}

            {job?.status === 'FAILED' && (
              <Button onClick={runAnalysis} color="brand.7" w="fit-content">Retry Analysis</Button>
            )}
          </Stack>
        </Paper>
      )}

      {noResults && !result && !analyzing && (
        <Paper withBorder radius="lg" p="xl" className="bg-white text-center">
          <Stack align="center">
            <Text>No analysis results yet.</Text>
            <Button onClick={runAnalysis} color="brand.7">Run Analysis</Button>
          </Stack>
        </Paper>
      )}

      {result && (
        <>
          <Card withBorder radius="lg" p="xl" className="bg-white">
            <Stack align="center" gap="sm">
              <Title order={3}>Fit Score</Title>
              <Text fz="3rem" fw={700} c={`${scoreColor(fitScorePct)}.7`}>{fitScorePct}%</Text>
              <Text ta="center" c="dimmed" maw={760}>{getFitScoreMessage(fitScorePct)}</Text>
              <Text c="dimmed">Critical-path estimate: {result.totalPrepMonths} months</Text>

              <Group>
                <Button onClick={() => exportReport('pdf')} loading={exporting === 'pdf'} disabled={exporting !== null} color="brand.7">
                  Save as PDF
                </Button>
                <Button onClick={() => exportReport('html')} loading={exporting === 'html'} disabled={exporting !== null} variant="outline" color="brand.8">
                  Save as HTML
                </Button>
              </Group>

              {result.timeEstimate && (
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm" w="100%" maw={820}>
                  <Badge size="lg" variant="light" color="brand.1">Optimistic: {result.timeEstimate.optimisticHours}h</Badge>
                  <Badge size="lg" variant="light" color="brand.1">Realistic: {result.timeEstimate.realisticHours}h</Badge>
                  <Badge size="lg" variant="light" color="brand.1">Critical Path: {result.timeEstimate.criticalPathHours}h</Badge>
                </SimpleGrid>
              )}
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Title order={3}>Fit Score Contributors</Title>
              <Text size="sm" c="dimmed">
                Top bar: your current level. Bottom bar: expected target level for this competency.
              </Text>
              {groupOrder.map((group) => {
                const contributors = groupedContributors[group] ?? [];
                if (contributors.length === 0) return null;
                return (
                  <Stack key={group} gap="xs">
                    <Text fw={700}>{priorityLabel[group] ?? formatEnumLabel(group)}</Text>
                    {contributors.map((contributor) => {
                      const item = analysisByCompetency.get(contributor.competencyId);
                      const currentPct = Math.round((Number(item?.normalizedCurrentScore ?? contributor.matchScore) || 0) * 100);
                      const expectedPct = Math.round((Number(item?.normalizedRequiredScore ?? 1) || 0) * 100);
                      return (
                        <Card key={contributor.competencyId} withBorder radius="md" p="sm">
                          <Stack gap={6}>
                            <Group justify="space-between" wrap="wrap">
                              <Text>{contributor.competencyName}</Text>
                              <Text size="sm" c="dimmed">{currentPct}/{expectedPct}%</Text>
                            </Group>
                            <Progress value={currentPct} color={scoreColor(currentPct)} />
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
              <Title order={3}>Actionable Gaps</Title>
              {result.actionableGaps.length === 0 && <Text c="dimmed">No actionable gaps identified.</Text>}
              {result.actionableGaps.map((gap) => (
                <Card key={gap.competency.id} withBorder radius="md" p="sm">
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="wrap">
                      <Text fw={600}>{gap.competency.name}</Text>
                      <Badge variant="light" color="brand.1">{gap.currentLevel} to {gap.requiredLevel}</Badge>
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

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Title order={3}>Market Context / Exclusions</Title>
              {result.marketContext.map((item) => (
                <Card key={item.competency.id} withBorder radius="md" p="sm">
                  <Stack gap={4}>
                    <Text fw={600}>{item.competency.name} - {formatEnumLabel(item.recommendationType)}</Text>
                    <Text size="sm" c="dimmed">{item.reason}</Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Card>

          <Button component={RouterLink} to={`/progress/${profileId}`} color="brand.7" w="fit-content">
            View Progress Tracker
          </Button>
        </>
      )}
    </Stack>
  );
}
