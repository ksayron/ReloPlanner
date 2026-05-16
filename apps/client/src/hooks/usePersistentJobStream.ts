import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import type { ProcessingJobSnapshot } from '../types';
import { isTerminalJobStatus } from '../utils/jobProgress';
import i18n from '../i18n';

interface UsePersistentJobStreamOptions {
  enabled?: boolean;
  storageKey: string;
  streamDisconnectedMessage: string;
  hideCompletedAfterMs?: number;
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
    hideCompletedAfterMs = 0,
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
  const hideCompletedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadActiveJobRef = useRef(loadActiveJob);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);
  const onActiveJobRestoredRef = useRef(onActiveJobRestored);

  useEffect(() => {
    loadActiveJobRef.current = loadActiveJob;
    onCompletedRef.current = onCompleted;
    onFailedRef.current = onFailed;
    onActiveJobRestoredRef.current = onActiveJobRestored;
  }, [loadActiveJob, onCompleted, onFailed, onActiveJobRestored]);

  const closeStream = () => {
    const source = eventSourceRef.current as { close: () => void } | null;
    if (!source) return;
    source.close();
    eventSourceRef.current = null;
  };

  const clearPersistedState = () => {
    localStorage.removeItem(storageKey);
  };

  const clearHideCompletedTimer = () => {
    if (!hideCompletedTimerRef.current) return;
    clearTimeout(hideCompletedTimerRef.current);
    hideCompletedTimerRef.current = null;
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
    clearHideCompletedTimer();
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
      await onCompletedRef.current?.(snapshot);
      if (hideCompletedAfterMs > 0) {
        clearHideCompletedTimer();
        hideCompletedTimerRef.current = setTimeout(() => {
          setJob((current) => (current?.status === 'COMPLETED' ? null : current));
          setJobHistory([]);
        }, hideCompletedAfterMs);
      }
      return;
    }

    const maybeMessage = onFailedRef.current?.(snapshot);
    setError(maybeMessage ?? snapshot.errorMessage ?? i18n.t('jobs.jobFailed'));
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
      throw new Error(i18n.t('jobs.missingSseToken'));
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
      const message = err instanceof Error ? err.message : i18n.t('jobs.jobFailed');
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
      if (parsed.job && !isTerminalJobStatus(parsed.job.status)) {
        setJob(parsed.job);
        if (Array.isArray(parsed.history)) setJobHistory(parsed.history);
        setRunning(true);
      } else {
        clearPersistedState();
        setJob(null);
        setJobHistory([]);
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
        const activeJob = await loadActiveJobRef.current();
        if (cancelled) return;

        if (!activeJob) {
          setRunning(false);
          setJob((current) => {
            if (current?.status === 'FAILED') return current;
            clearPersistedState();
            setJobHistory([]);
            return null;
          });
          return;
        }

        onActiveJobRestoredRef.current?.(activeJob);
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
      clearHideCompletedTimer();
      closeStream();
    };
  }, [enabled, hideCompletedAfterMs, storageKey]);

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

