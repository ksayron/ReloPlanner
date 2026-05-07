import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import client from '../../api/client';
import { fetchCountriesCatalog } from '../../api/countries';
import { usePersistentJobStream } from '../../hooks/usePersistentJobStream';
import { formatEnumLabel, getJobStepLabel } from '../../utils/jobProgress';

interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
  attempts?: number;
}
interface SnapshotInfo { date: string | null; source: string | null; skills: number; status?: 'synced' | 'skipped' | 'error' | 'unknown'; totalVacancies?: number | null; skillsImported?: number | null; message?: string | null; updatedAt?: string | null; attempts?: number | null; errorKind?: string | null; failureStage?: string | null; }
interface CacheStatus { lastRefreshed: string | null; ageMinutes: number | null; staleThresholdMinutes: number; isStale: boolean; endpoints: Record<string, boolean>; }
interface ColSkippedItem { countryIso: string; city: string; reason: string; }
interface MarketRun { id: string; trigger: 'manual' | 'scheduled' | 'startup'; startedAt: string; finishedAt: string; durationMs: number; status: 'success' | 'partial' | 'failed'; summary: { synced: number; skipped: number; error: number }; }
interface MarketHealth { status: 'healthy' | 'degraded' | 'unhealthy'; staleThresholdMinutes: number; staleCountries: string[]; lastRun: MarketRun | null; summary: { synced: number; skipped: number; errors: number }; }
interface ColRun { id: string; startedAt: string; finishedAt: string; durationMs: number; status: 'success' | 'partial' | 'failed'; updatedCount: number; skippedCount: number; message: string | null; }
interface ColSyncHealth { status: 'healthy' | 'degraded' | 'unhealthy'; lastRun: ColRun | null; }

const statusColor = (status: SyncResult['status']) => status === 'synced' ? 'teal' : status === 'skipped' ? 'yellow' : 'red';
const healthColor = (status: 'healthy' | 'degraded' | 'unhealthy') => status === 'healthy' ? 'teal' : status === 'degraded' ? 'yellow' : 'red';

export default function SyncManager() {
  const [marketStatus, setMarketStatus] = useState<Record<string, SnapshotInfo | null>>({});
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [syncingCountry, setSyncingCountry] = useState<string | null>(null);
  const [colSyncing, setColSyncing] = useState(false);
  const [colResult, setColResult] = useState<{ updated: string[]; skipped: ColSkippedItem[] } | null>(null);
  const [marketHealth, setMarketHealth] = useState<MarketHealth | null>(null);
  const [marketRuns, setMarketRuns] = useState<MarketRun[]>([]);
  const [colSyncHealth, setColSyncHealth] = useState<ColSyncHealth | null>(null);
  const [colRuns, setColRuns] = useState<ColRun[]>([]);
  const [pageError, setPageError] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCountries = async () => {
    const catalog = await fetchCountriesCatalog();
    setCountries(catalog.target.map((country) => country.code));
  };

  const loadStatus = useCallback(async () => {
    try {
      const [marketRes, cacheRes] = await Promise.all([
        client.get('/admin/sync/market/status'),
        client.get('/cost-of-living/cache-status'),
      ]);
      setMarketStatus(marketRes.data);
      setCacheStatus(cacheRes.data);

      const [marketHealthRes, marketRunsRes, colHealthRes, colRunsRes] = await Promise.all([
        client.get('/admin/sync/market/health'),
        client.get('/admin/sync/market/runs?limit=5'),
        client.get('/cost-of-living/sync/status'),
        client.get('/cost-of-living/sync/runs?limit=5'),
      ]);
      setMarketHealth(marketHealthRes.data);
      setMarketRuns(Array.isArray(marketRunsRes.data) ? marketRunsRes.data : []);
      setColSyncHealth(colHealthRes.data);
      setColRuns(Array.isArray(colRunsRes.data) ? colRunsRes.data : []);
    } catch {
      setPageError('Failed to load sync status');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadStatus(), loadCountries()]);
      setLoading(false);
    })();
  }, [loadStatus]);

  const {
    job: marketJob,
    jobHistory: marketJobHistory,
    running: syncingAll,
    error: jobError,
    setError: setJobError,
    startJob,
  } = usePersistentJobStream({
    storageKey: 'job-progress:MARKET_SYNC',
    streamDisconnectedMessage: 'Market sync progress stream disconnected',
    loadActiveJob: async () => {
      const activeResponse = await client.get('/jobs/active', { params: { type: 'MARKET_SYNC' } });
      return activeResponse.data;
    },
    onCompleted: async (snapshot) => {
      const resultPayload = snapshot.result as { results?: SyncResult[] } | null;
      setSyncResults(Array.isArray(resultPayload?.results) ? resultPayload.results : []);
      await loadStatus();
    },
    onFailed: (snapshot) => snapshot.errorMessage ?? 'Market sync failed',
  });

  const handleSyncAll = async () => {
    setSyncResults([]);
    setPageError('');
    try {
      await startJob(async () => {
        const startResponse = await client.post('/jobs/market/sync');
        return String(startResponse.data.jobId);
      });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'response' in err && (err as any).response?.status === 429) {
        setJobError('Manual market sync is limited to 5 runs per hour');
      } else {
        setJobError('Market sync failed');
      }
    }
  };

  const handleSyncCountry = async (country: string) => {
    setSyncingCountry(country);
    setPageError('');
    try {
      const res = await client.post(`/admin/sync/market/${country}`);
      setSyncResults([res.data]);
      await loadStatus();
    } catch {
      setPageError(`Sync failed for ${country}`);
    } finally {
      setSyncingCountry(null);
    }
  };

  const handleColSync = async () => {
    setColSyncing(true);
    setColResult(null);
    setPageError('');
    try {
      const res = await client.post('/cost-of-living/sync');
      setColResult(res.data);
      await loadStatus();
    } catch {
      setPageError('CoL sync failed');
    } finally {
      setColSyncing(false);
    }
  };

  if (loading) return <div className="mt-10 flex justify-center"><Loader color="brand.7" /></div>;

  const error = pageError || jobError;

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Title order={2}>Data Sync Manager</Title>
      {error && <Alert color="red">{error}</Alert>}

      <Paper withBorder radius="lg" p="lg" className="bg-white"><Stack><Group justify="space-between" align="center"><Title order={3}>Job Market Snapshots</Title><Button onClick={handleSyncAll} loading={syncingAll} color="brand.7">Sync All Countries</Button></Group><Text size="sm" c="dimmed">DE, NL, CA, GB, PL via Adzuna API | Runs daily at 02:00 UTC</Text><Table withTableBorder withColumnBorders striped><Table.Thead><Table.Tr><Table.Th>Country</Table.Th><Table.Th>Last Snapshot</Table.Th><Table.Th className="text-right">Skills</Table.Th><Table.Th>Source</Table.Th><Table.Th className="w-24">Action</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{countries.map((country) => { const info = marketStatus[country]; return <Table.Tr key={country}><Table.Td><Text fw={600}>{country}</Text></Table.Td><Table.Td>{info?.date ? new Date(info.date).toLocaleDateString() : 'No data'}</Table.Td><Table.Td className="text-right">{info?.skills ?? 'N/A'}</Table.Td><Table.Td><Text size="sm" c="dimmed">{info?.source ?? 'N/A'} {info?.status ? `(${info.status})` : ''}</Text>{info?.attempts ? <Text size="xs" c="dimmed">attempts: {info.attempts}{info.errorKind ? ` | error: ${info.errorKind}` : ''}{info.failureStage ? ` | stage: ${info.failureStage}` : ''}</Text> : null}</Table.Td><Table.Td><Button variant="light" color="brand.1" loading={syncingCountry === country} disabled={syncingAll} onClick={() => handleSyncCountry(country)} size="xs">Sync</Button></Table.Td></Table.Tr>; })}</Table.Tbody></Table>{syncResults.length > 0 && <Group gap="xs">{syncResults.map((result) => <Badge key={result.country} color={statusColor(result.status)} variant="light">{result.country}: {result.status}{result.skillsImported != null ? ` (${result.skillsImported} skills)` : ''}{result.message ? ` - ${result.message}` : ''}{result.attempts != null ? ` [attempts: ${result.attempts}]` : ''}</Badge>)}</Group>}{marketJob && <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60"><Stack gap="xs"><Title order={5}>Manual Sync Progress</Title><Text size="sm">Status: <strong>{formatEnumLabel(marketJob.status)}</strong></Text><Text size="sm">Current step: <strong>{getJobStepLabel(marketJob.currentStep)}</strong></Text><Progress value={Math.max(0, Math.min(100, marketJob.progressPercent))} color={marketJob.status === 'FAILED' ? 'red' : 'teal'} /><Text size="sm" c="dimmed">{marketJob.progressPercent}% complete</Text>{marketJobHistory.map((item, idx) => <Text key={`${item.currentStep}-${item.progressPercent}-${idx}`} size="xs" c="dimmed">{getJobStepLabel(item.currentStep)} ({item.progressPercent}%)</Text>)}</Stack></Card>}{marketHealth && <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60"><Stack gap="xs"><Badge color={healthColor(marketHealth.status)} variant="light" w="fit-content">Market Sync Health: {marketHealth.status.toUpperCase()}</Badge><Text size="sm" c="dimmed">Summary: {marketHealth.summary.synced} synced, {marketHealth.summary.skipped} skipped, {marketHealth.summary.errors} errors</Text>{marketHealth.staleCountries.length > 0 ? <Text size="sm" c="yellow.8">Stale countries (&gt; {marketHealth.staleThresholdMinutes} min): {marketHealth.staleCountries.join(', ')}</Text> : null}</Stack></Card>}{marketRuns.length > 0 && <Card withBorder radius="md" p="md"><Stack gap="xs"><Title order={5}>Recent market sync runs</Title>{marketRuns.map((run) => <Text key={run.id} size="sm" c="dimmed">{new Date(run.finishedAt).toLocaleString()} - {run.trigger} - {run.status} - {run.summary.synced}/{run.summary.skipped}/{run.summary.error}</Text>)}</Stack></Card>}</Stack></Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white"><Stack><Group justify="space-between" align="center"><Title order={3}>Cost of Living Data</Title><Button onClick={handleColSync} loading={colSyncing} color="brand.7">Sync from WhereNext</Button></Group><Text size="sm" c="dimmed">Source: getwherenext.com | Cities: Berlin, Amsterdam, London, Warsaw, Toronto | Cache refreshes hourly</Text>{cacheStatus && <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60"><Stack gap="xs"><Text size="sm" c="dimmed">Cache last refreshed: {cacheStatus.lastRefreshed ? new Date(cacheStatus.lastRefreshed).toLocaleString() : 'Not yet loaded'}</Text><Badge color={cacheStatus.isStale ? 'red' : 'teal'} variant="light" w="fit-content">Cache status: {cacheStatus.isStale ? 'STALE' : 'FRESH'}{cacheStatus.ageMinutes != null ? ` (${cacheStatus.ageMinutes} min old)` : ''}</Badge><Group gap="xs">{Object.entries(cacheStatus.endpoints).map(([key, loaded]) => <Badge key={key} color={loaded ? 'teal' : 'red'} variant="outline">{key}: {loaded ? 'OK' : 'missing'}</Badge>)}</Group></Stack></Card>}{colResult && <Card withBorder radius="md" p="md"><Stack gap="xs"><Text size="sm" c="teal">Updated: {colResult.updated.join(', ') || 'none'}</Text>{colResult.skipped.length > 0 && <Stack gap={4}><Text size="sm" c="yellow.8">Skipped:</Text>{colResult.skipped.map((item) => <Text key={`${item.countryIso}-${item.city}`} size="sm" c="dimmed">{item.city} ({item.countryIso}) - {item.reason}</Text>)}</Stack>}</Stack></Card>}{colSyncHealth && <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60"><Badge color={healthColor(colSyncHealth.status)} variant="light" w="fit-content">CoL Sync Health: {colSyncHealth.status.toUpperCase()}</Badge></Card>}{colRuns.length > 0 && <Card withBorder radius="md" p="md"><Stack gap="xs"><Title order={5}>Recent CoL sync runs</Title>{colRuns.map((run) => <Text key={run.id} size="sm" c="dimmed">{new Date(run.finishedAt).toLocaleString()} - {run.status} - updated {run.updatedCount}, skipped {run.skippedCount}{run.message ? ` - ${run.message}` : ''}</Text>)}</Stack></Card>}</Stack></Paper>
    </Stack>
  );
}
