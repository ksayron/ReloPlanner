import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import type { ProcessingJobSnapshot } from '../types';
import { isTerminalJobStatus } from '../utils/jobProgress';

interface UsePersistentJobStreamOptions {
  enabled?: boolean;
  storageKey: string;
  streamDisconnectedMessage: string;
  loadActiveJob: () => Promise<ProcessingJobSnapshot | null>;
  onCompleted?: (snapshot: ProcessingJobSnapshot) => Promise<void> | void;
  onFailed?: (snapshot: ProcessingJobSnapshot) => string | void;
  onActiveJobRestored?: (snapshot: ProcessingJobSnapshot) => void;
}

interface StoredState {
  job?: ProcessingJobSnapshot | null;
  history?: ProcessingJobSnapshot[];
}

export function usePersistentJobStream(options: UsePersistentJobStreamOptions) {
  const {
    enabled = true,
    storageKey,
    streamDisconnectedMessage,
    loadActiveJob,
    onCompleted,
    onFailed,
    onActiveJobRestored,
  } = options;

  const [job, setJob] = useState<ProcessingJobSnapshot | null>(null);
  const [jobHistory, setJobHistory] = useState<ProcessingJobSnapshot[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const eventSourceRef = useRef<EventSource | null>(null);
  const finishedRef = useRef<{ done: boolean }>({ done: false });

  const closeStream = () => {
    const source = eventSourceRef.current as { close: () => void } | null;
    if (!source) return;
    source.close();
    eventSourceRef.current = null;
  };

  const clearPersistedState = () => {
    localStorage.removeItem(storageKey);
  };

  const persistState = (nextJob: ProcessingJobSnapshot, nextHistory: ProcessingJobSnapshot[]) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        job: nextJob,
        history: nextHistory,
        updatedAt: new Date().toISOString(),
      }),
    );
  };

  const reset = () => {
    closeStream();
    finishedRef.current.done = false;
    setRunning(false);
    setJob(null);
    setJobHistory([]);
    setError('');
    clearPersistedState();
  };

  const applySnapshot = async (snapshot: ProcessingJobSnapshot) => {
    setJob(snapshot);
    setJobHistory((prev) => {
      const last = prev[prev.length - 1];
      const nextHistory =
        last &&
        last.currentStep === snapshot.currentStep &&
        last.status === snapshot.status &&
        last.progressPercent === snapshot.progressPercent &&
        last.errorMessage === snapshot.errorMessage
          ? prev
          : [...prev, snapshot];
      persistState(snapshot, nextHistory);
      return nextHistory;
    });

    if (!isTerminalJobStatus(snapshot.status) || finishedRef.current.done) return;

    finishedRef.current.done = true;
    setRunning(false);
    closeStream();
    clearPersistedState();

    if (snapshot.status === 'COMPLETED') {
      await onCompleted?.(snapshot);
      return;
    }

    const maybeMessage = onFailed?.(snapshot);
    setError(maybeMessage ?? snapshot.errorMessage ?? 'Job failed');
  };

  const attachToJob = async (jobId: string, initialSnapshot?: ProcessingJobSnapshot) => {
    if (!enabled) return;

    closeStream();
    finishedRef.current.done = false;
    setRunning(true);
    setError('');

    if (initialSnapshot) {
      await applySnapshot(initialSnapshot);
      if (finishedRef.current.done) return;
    } else {
      const statusResponse = await client.get(`/jobs/${jobId}`);
      await applySnapshot(statusResponse.data as ProcessingJobSnapshot);
      if (finishedRef.current.done) return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Missing auth token for SSE connection');
    }

    const eventSource = new EventSource(`/api/jobs/${jobId}/events?access_token=${encodeURIComponent(token)}`);
    eventSourceRef.current = eventSource;

    const onSnapshotEvent = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as ProcessingJobSnapshot;
        void applySnapshot(snapshot);
      } catch {
        // ignore malformed event payloads
      }
    };

    eventSource.onmessage = onSnapshotEvent;
    eventSource.addEventListener('job.update', onSnapshotEvent as EventListener);
    eventSource.onerror = () => {
      if (finishedRef.current.done) return;
      closeStream();
      setRunning(false);
      setError(streamDisconnectedMessage);
    };
  };

  const startJob = async (createJob: () => Promise<string>) => {
    reset();
    setRunning(true);
    try {
      const jobId = await createJob();
      await attachToJob(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Job failed';
      setError(message);
      setRunning(false);
      closeStream();
      throw err;
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed.job) setJob(parsed.job);
      if (Array.isArray(parsed.history)) setJobHistory(parsed.history);
      if (parsed.job && !isTerminalJobStatus(parsed.job.status)) {
        setRunning(true);
      }
    } catch {
      clearPersistedState();
    }
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const restoreActiveJob = async () => {
      try {
        const activeJob = await loadActiveJob();
        if (cancelled) return;

        if (!activeJob) {
          setRunning(false);
          setJob((current) => {
            if (!current || isTerminalJobStatus(current.status)) return current;
            clearPersistedState();
            setJobHistory([]);
            return null;
          });
          return;
        }

        onActiveJobRestored?.(activeJob);
        setJobHistory((prev) => (prev.length > 0 ? prev : [activeJob]));
        await attachToJob(activeJob.id, activeJob);
      } catch {
        if (cancelled) return;
        setRunning(false);
      }
    };

    void restoreActiveJob();

    return () => {
      cancelled = true;
      closeStream();
    };
  }, [enabled, loadActiveJob, onActiveJobRestored, storageKey]);

  return {
    job,
    jobHistory,
    running,
    error,
    setError,
    startJob,
    reset,
  };
}
