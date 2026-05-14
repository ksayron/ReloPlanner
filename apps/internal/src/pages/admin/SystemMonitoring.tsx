import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
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
import type {
  ProcessingJobSnapshot,
  ProcessingJobType,
  RealtimeEnvelope,
  RealtimeAdminSystemSnapshotPayload,
} from '@reloplanner/shared-contracts';
import { useAuth } from '@reloplanner/shared-frontend';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface SystemStateResponse {
  generatedAt: string;
  status: HealthStatus;
  process: {
    pid: number;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
      heapUsagePercent: number;
    };
  };
  dependencies: Array<{
    name: string;
    status: HealthStatus;
    latencyMs: number | null;
    message: string | null;
  }>;
  queue: {
    pending: number;
    running: number;
    stuck: number;
    oldestPendingCreatedAt: string | null;
    completedLastHour: number;
    failedLastHour: number;
  };
  websocket: {
    status: HealthStatus;
    activeConnections: number;
    recentEmits: Array<{
      at: string;
      event: string;
      target: string;
      recipients: number;
    }>;
    recentFailures: Array<{
      at: string;
      event: string;
      target: string;
      error: string;
    }>;
  };
  warnings: string[];
}

interface QueueDashboardResponse {
  generatedAt: string;
  stuckThresholdMinutes: number;
  totals: {
    all: number;
    pending: number;
    running: number;
    completedLast24h: number;
    failedLast24h: number;
  };
  throughput: {
    completedLastHour: number;
    failedLastHour: number;
    completedLast24h: number;
    failedLast24h: number;
  };
  queue: {
    pending: number;
    running: number;
    stuck: number;
    oldestPendingCreatedAt: string | null;
  };
  byType: Array<{
    type: ProcessingJobType;
    pending: number;
    running: number;
    completedLast24h: number;
    failedLast24h: number;
    total: number;
  }>;
  active: Array<
    ProcessingJobSnapshot & {
      runSeconds: number | null;
      isPossiblyStuck: boolean;
    }
  >;
  recent: Array<
    ProcessingJobSnapshot & {
      durationSeconds: number | null;
      ageSeconds: number;
      isRetryable: boolean;
    }
  >;
}

const statusColor = (status: HealthStatus) =>
  status === 'healthy' ? 'teal' : status === 'degraded' ? 'yellow' : 'red';

const jobStatusColor = (status: ProcessingJobSnapshot['status']) => {
  if (status === 'COMPLETED') return 'teal';
  if (status === 'RUNNING') return 'blue';
  if (status === 'PENDING') return 'yellow';
  return 'red';
};

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const formatSeconds = (seconds: number | null) => {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${restSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}h ${restMinutes}m`;
};

export default function SystemMonitoring() {
  const { token } = useAuth();
  const [systemState, setSystemState] = useState<SystemStateResponse | null>(null);
  const [queueDashboard, setQueueDashboard] =
    useState<QueueDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (showFullLoader: boolean) => {
    if (showFullLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');
    try {
      const [stateRes, queueRes] = await Promise.all([
        client.get<SystemStateResponse>('/admin/system/state'),
        client.get<QueueDashboardResponse>('/admin/system/queue', {
          params: { limit: 30 },
        }),
      ]);
      setSystemState(stateRes.data);
      setQueueDashboard(queueRes.data);
    } catch {
      setError('Failed to load monitoring dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  useEffect(() => {
    if (!token) return;

    const resolveRealtimeBaseUrl = () => {
      const { protocol, hostname, port, origin } = window.location;
      if (port === '5173' || port === '5174') {
        return `${protocol}//${hostname}:3000`;
      }
      return origin;
    };

    const socket: Socket = io(resolveRealtimeBaseUrl(), {
      path: '/api/realtime',
      transports: ['websocket'],
      auth: { token },
      query: { access_token: token },
      timeout: 10000,
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 700,
    });

    const subscribeAdminSystem = () => {
      socket.timeout(5000).emit(
        'admin.system.subscribe',
        {},
        (err: unknown, response: { ok?: boolean; error?: string } | undefined) => {
          if (err) {
            setError('Failed to subscribe admin monitoring realtime stream');
            console.warn('[admin-monitoring] subscribe timeout/error', String(err));
            return;
          }
          if (!response?.ok) {
            setError(response?.error || 'Admin monitoring realtime subscription rejected');
            console.warn('[admin-monitoring] subscribe rejected', response);
            return;
          }
          console.info('[admin-monitoring] subscribe ok');
        },
      );
    };

    socket.on('session.ready', () => {
      subscribeAdminSystem();
    });

    socket.on(
      'admin.system.snapshot',
      (envelope: RealtimeEnvelope<'admin.system.snapshot'>) => {
        const payload = envelope.data as RealtimeAdminSystemSnapshotPayload;
        setSystemState(payload.systemState as unknown as SystemStateResponse);
        setQueueDashboard(payload.queueDashboard as unknown as QueueDashboardResponse);
      },
    );

    socket.on('connect_error', () => {
      setError('Realtime monitoring connection failed');
    });

    return () => {
      socket.emit('admin.system.unsubscribe');
      socket.disconnect();
    };
  }, [token]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    setError('');
    try {
      await client.post(`/jobs/admin/queue/${jobId}/retry`);
      await loadData(false);
    } catch {
      setError('Failed to retry job');
    } finally {
      setRetryingJobId(null);
    }
  };

  const stateBadge = useMemo(() => {
    if (!systemState) return null;
    return (
      <Badge color={statusColor(systemState.status)} variant="light">
        {systemState.status.toUpperCase()}
      </Badge>
    );
  }, [systemState]);

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  if (!systemState || !queueDashboard) {
    return (
      <Stack className="mx-auto max-w-6xl" gap="lg">
        <Title order={2}>System Monitoring</Title>
        {error ? <Alert color="red">{error}</Alert> : null}
      </Stack>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm" align="center">
          <Title order={2}>System Monitoring</Title>
          {stateBadge}
        </Group>
        <Button
          variant="light"
          color="brand.7"
          loading={refreshing}
          onClick={() => void loadData(false)}
        >
          Refresh
        </Button>
      </Group>

      {error ? <Alert color="red">{error}</Alert> : null}

      {systemState.warnings.length > 0 ? (
        <Alert color="yellow" title="Warnings">
          {systemState.warnings.join(' | ')}
        </Alert>
      ) : null}

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="md">
          <Title order={3}>Health Overview</Title>
          <Group grow>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  API Uptime
                </Text>
                <Text fw={700}>{formatSeconds(systemState.process.uptimeSeconds)}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Node
                </Text>
                <Text fw={700}>{systemState.process.nodeVersion}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Heap Usage
                </Text>
                <Text fw={700}>
                  {systemState.process.memory.heapUsagePercent.toFixed(1)}%
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  PID / Platform
                </Text>
                <Text fw={700}>
                  {systemState.process.pid} / {systemState.process.platform}
                </Text>
              </Stack>
            </Card>
          </Group>

          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Dependency</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Latency</Table.Th>
                <Table.Th>Details</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {systemState.dependencies.map((dependency) => (
                <Table.Tr key={dependency.name}>
                  <Table.Td>{dependency.name}</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(dependency.status)} variant="light">
                      {dependency.status.toUpperCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {dependency.latencyMs != null ? `${dependency.latencyMs} ms` : '-'}
                  </Table.Td>
                  <Table.Td>{dependency.message ?? '-'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group grow>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  RSS Memory
                </Text>
                <Text fw={700}>{formatBytes(systemState.process.memory.rssBytes)}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Heap Used / Total
                </Text>
                <Text fw={700}>
                  {formatBytes(systemState.process.memory.heapUsedBytes)} /{' '}
                  {formatBytes(systemState.process.memory.heapTotalBytes)}
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Queue Pending / Running
                </Text>
                <Text fw={700}>
                  {systemState.queue.pending} / {systemState.queue.running}
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Queue Stuck
                </Text>
                <Text fw={700}>{systemState.queue.stuck}</Text>
              </Stack>
            </Card>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="md">
          <Title order={3}>Job Queue Dashboard</Title>
          <Text size="sm" c="dimmed">
            Hangfire-style queue insight with retry controls for failed, retryable jobs.
          </Text>

          <Group grow>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Total Jobs
                </Text>
                <Text fw={700}>{queueDashboard.totals.all}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Pending
                </Text>
                <Text fw={700}>{queueDashboard.totals.pending}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Running
                </Text>
                <Text fw={700}>{queueDashboard.totals.running}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Failed (24h)
                </Text>
                <Text fw={700}>{queueDashboard.totals.failedLast24h}</Text>
              </Stack>
            </Card>
          </Group>

          <Card withBorder radius="md" p="md" className="bg-[var(--app-bg)]/60">
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                Throughput 1h: {queueDashboard.throughput.completedLastHour} completed /{' '}
                {queueDashboard.throughput.failedLastHour} failed
              </Text>
              <Text size="sm" c="dimmed">
                Throughput 24h: {queueDashboard.throughput.completedLast24h} completed /{' '}
                {queueDashboard.throughput.failedLast24h} failed
              </Text>
              <Text size="sm" c="dimmed">
                Oldest pending:{' '}
                {queueDashboard.queue.oldestPendingCreatedAt
                  ? new Date(queueDashboard.queue.oldestPendingCreatedAt).toLocaleString()
                  : 'none'}
              </Text>
            </Group>
          </Card>

          <Title order={5}>Queue by Job Type</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th className="text-right">Total</Table.Th>
                <Table.Th className="text-right">Pending</Table.Th>
                <Table.Th className="text-right">Running</Table.Th>
                <Table.Th className="text-right">Completed (24h)</Table.Th>
                <Table.Th className="text-right">Failed (24h)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {queueDashboard.byType.map((row) => (
                <Table.Tr key={row.type}>
                  <Table.Td>{row.type}</Table.Td>
                  <Table.Td className="text-right">{row.total}</Table.Td>
                  <Table.Td className="text-right">{row.pending}</Table.Td>
                  <Table.Td className="text-right">{row.running}</Table.Td>
                  <Table.Td className="text-right">{row.completedLast24h}</Table.Td>
                  <Table.Td className="text-right">{row.failedLast24h}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Title order={5}>Active Jobs</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Step</Table.Th>
                <Table.Th className="text-right">Progress</Table.Th>
                <Table.Th>Started</Table.Th>
                <Table.Th>Runtime</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {queueDashboard.active.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="dimmed" ta="center">
                      No active jobs
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                queueDashboard.active.map((job) => (
                  <Table.Tr key={job.id}>
                    <Table.Td>{job.type}</Table.Td>
                    <Table.Td>
                      <Badge color={jobStatusColor(job.status)} variant="light">
                        {job.status}
                        {job.isPossiblyStuck ? ' / STUCK' : ''}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{job.currentStep}</Table.Td>
                    <Table.Td className="text-right">{job.progressPercent}%</Table.Td>
                    <Table.Td>
                      {job.startedAt ? new Date(job.startedAt).toLocaleString() : '-'}
                    </Table.Td>
                    <Table.Td>{formatSeconds(job.runSeconds)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>

          <Title order={5}>Recent Jobs</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>Error</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {queueDashboard.recent.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>{job.type}</Table.Td>
                  <Table.Td>
                    <Badge color={jobStatusColor(job.status)} variant="light">
                      {job.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{new Date(job.createdAt).toLocaleString()}</Table.Td>
                  <Table.Td>{formatSeconds(job.durationSeconds)}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {job.errorMessage ?? '-'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      color="brand.7"
                      disabled={!job.isRetryable || retryingJobId !== null}
                      loading={retryingJobId === job.id}
                      onClick={() => void handleRetryJob(job.id)}
                    >
                      Retry
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>Realtime Health (Chat + Notifications)</Title>
            <Badge color={statusColor(systemState.websocket.status)} variant="light">
              {systemState.websocket.status.toUpperCase()}
            </Badge>
          </Group>

          <Group grow>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Active Socket Connections
                </Text>
                <Text fw={700}>{systemState.websocket.activeConnections}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Recent Emits
                </Text>
                <Text fw={700}>{systemState.websocket.recentEmits.length}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Recent Failures
                </Text>
                <Text fw={700}>{systemState.websocket.recentFailures.length}</Text>
              </Stack>
            </Card>
          </Group>

          <Title order={5}>Recent Emits</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>At</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th className="text-right">Recipients</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {systemState.websocket.recentEmits.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed" ta="center">
                      No recent websocket emits
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                systemState.websocket.recentEmits.map((emit, index) => (
                  <Table.Tr key={`${emit.at}-${emit.event}-${index}`}>
                    <Table.Td>{new Date(emit.at).toLocaleString()}</Table.Td>
                    <Table.Td>{emit.event}</Table.Td>
                    <Table.Td>{emit.target}</Table.Td>
                    <Table.Td className="text-right">{emit.recipients}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>

          <Title order={5}>Recent Failures</Title>
          <Table withTableBorder withColumnBorders striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>At</Table.Th>
                <Table.Th>Event</Table.Th>
                <Table.Th>Target</Table.Th>
                <Table.Th>Error</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {systemState.websocket.recentFailures.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed" ta="center">
                      No recent websocket failures
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                systemState.websocket.recentFailures.map((failure, index) => (
                  <Table.Tr key={`${failure.at}-${failure.event}-${index}`}>
                    <Table.Td>{new Date(failure.at).toLocaleString()}</Table.Td>
                    <Table.Td>{failure.event}</Table.Td>
                    <Table.Td>{failure.target}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {failure.error}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    </Stack>
  );
}
