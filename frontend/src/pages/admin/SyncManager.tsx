import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import client from '../../api/client';
import { fetchCountriesCatalog } from '../../api/countries';

interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
}

interface SnapshotInfo {
  date: string | null;
  source: string | null;
  skills: number;
  status?: 'synced' | 'skipped' | 'error' | 'unknown';
  totalVacancies?: number | null;
  skillsImported?: number | null;
  message?: string | null;
  updatedAt?: string | null;
}

interface CacheStatus {
  lastRefreshed: string | null;
  ageMinutes: number | null;
  staleThresholdMinutes: number;
  isStale: boolean;
  endpoints: Record<string, boolean>;
}

interface ColSkippedItem {
  countryIso: string;
  city: string;
  reason: string;
}

const statusColor = (status: SyncResult['status']) => {
  if (status === 'synced') return 'teal';
  if (status === 'skipped') return 'yellow';
  return 'red';
};

export default function SyncManager() {
  const [marketStatus, setMarketStatus] = useState<Record<string, SnapshotInfo | null>>({});
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingCountry, setSyncingCountry] = useState<string | null>(null);
  const [colSyncing, setColSyncing] = useState(false);
  const [colResult, setColResult] = useState<{ updated: string[]; skipped: ColSkippedItem[] } | null>(null);
  const [error, setError] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      await Promise.all([loadStatus(), loadCountries()]);
      setLoading(false);
    })();
  }, []);

  const loadCountries = async () => {
    const catalog = await fetchCountriesCatalog();
    setCountries(catalog.target.map((country) => country.code));
  };

  const loadStatus = async () => {
    try {
      const [marketRes, cacheRes] = await Promise.all([
        client.get('/admin/sync/market/status'),
        client.get('/cost-of-living/cache-status'),
      ]);
      setMarketStatus(marketRes.data);
      setCacheStatus(cacheRes.data);
    } catch {
      setError('Failed to load sync status');
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncResults([]);
    setError('');
    try {
      const res = await client.post('/admin/sync/market');
      setSyncResults(res.data);
      await loadStatus();
    } catch {
      setError('Market sync failed');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncCountry = async (country: string) => {
    setSyncingCountry(country);
    setError('');
    try {
      const res = await client.post(`/admin/sync/market/${country}`);
      setSyncResults([res.data]);
      await loadStatus();
    } catch {
      setError(`Sync failed for ${country}`);
    } finally {
      setSyncingCountry(null);
    }
  };

  const handleColSync = async () => {
    setColSyncing(true);
    setColResult(null);
    setError('');
    try {
      const res = await client.post('/cost-of-living/sync');
      setColResult(res.data);
      await loadStatus();
    } catch {
      setError('CoL sync failed');
    } finally {
      setColSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Title order={2}>Data Sync Manager</Title>
      {error && <Alert color="red">{error}</Alert>}

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Group justify="space-between" align="center">
            <Title order={3}>Job Market Snapshots</Title>
            <Button onClick={handleSyncAll} loading={syncingAll} color="brand.7">Sync All Countries</Button>
          </Group>
          <Text size="sm" c="dimmed">DE, NL, CA, GB, PL via Adzuna API | Runs daily at 02:00 UTC</Text>

          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Country</Table.Th>
                <Table.Th>Last Snapshot</Table.Th>
                <Table.Th className="text-right">Skills</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th className="w-24">Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {countries.map((country) => {
                const info = marketStatus[country];
                return (
                  <Table.Tr key={country}>
                    <Table.Td><Text fw={600}>{country}</Text></Table.Td>
                    <Table.Td>{info?.date ? new Date(info.date).toLocaleDateString() : 'No data'}</Table.Td>
                    <Table.Td className="text-right">{info?.skills ?? 'N/A'}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {info?.source ?? 'N/A'} {info?.status ? `(${info.status})` : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        variant="light"
                        color="brand.1"
                        loading={syncingCountry === country}
                        disabled={syncingAll}
                        onClick={() => handleSyncCountry(country)}
                        size="xs"
                      >
                        Sync
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          {syncResults.length > 0 && (
            <Group gap="xs">
              {syncResults.map((result) => (
                <Badge key={result.country} color={statusColor(result.status)} variant="light">
                  {result.country}: {result.status}
                  {result.skillsImported != null ? ` (${result.skillsImported} skills)` : ''}
                  {result.message ? ` - ${result.message}` : ''}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Group justify="space-between" align="center">
            <Title order={3}>Cost of Living Data</Title>
            <Button onClick={handleColSync} loading={colSyncing} color="brand.7">Sync from WhereNext</Button>
          </Group>
          <Text size="sm" c="dimmed">
            Source: getwherenext.com | Cities: Berlin, Amsterdam, London, Warsaw, Toronto | Cache refreshes hourly
          </Text>

          {cacheStatus && (
            <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60">
              <Stack gap="xs">
                <Text size="sm" c="dimmed">
                  Cache last refreshed:{' '}
                  {cacheStatus.lastRefreshed
                    ? new Date(cacheStatus.lastRefreshed).toLocaleString()
                    : 'Not yet loaded'}
                </Text>
                <Badge color={cacheStatus.isStale ? 'red' : 'teal'} variant="light" w="fit-content">
                  Cache status: {cacheStatus.isStale ? 'STALE' : 'FRESH'}
                  {cacheStatus.ageMinutes != null ? ` (${cacheStatus.ageMinutes} min old)` : ''}
                </Badge>
                <Group gap="xs">
                  {Object.entries(cacheStatus.endpoints).map(([key, loaded]) => (
                    <Badge key={key} color={loaded ? 'teal' : 'red'} variant="outline">
                      {key}: {loaded ? 'OK' : 'missing'}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Card>
          )}

          {colResult && (
            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Text size="sm" c="teal">Updated: {colResult.updated.join(', ') || 'none'}</Text>
                {colResult.skipped.length > 0 && (
                  <Stack gap={4}>
                    <Text size="sm" c="yellow.8">Skipped:</Text>
                    {colResult.skipped.map((item) => (
                      <Text key={`${item.countryIso}-${item.city}`} size="sm" c="dimmed">
                        {item.city} ({item.countryIso}) - {item.reason}
                      </Text>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
