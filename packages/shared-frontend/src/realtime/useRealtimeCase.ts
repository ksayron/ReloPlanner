import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RealtimeEnvelope } from '@reloplanner/shared-contracts';

export interface UseRealtimeCaseOptions {
  token: string | null;
  caseId?: string | null;
  onCaseMessageCreated?: (envelope: RealtimeEnvelope<'case.message.created'>) => void;
  onCaseMessageRead?: (envelope: RealtimeEnvelope<'case.message.read'>) => void;
  onCaseSystemCreated?: (envelope: RealtimeEnvelope<'case.system.created'>) => void;
  onNotificationCreated?: (envelope: RealtimeEnvelope<'notification.created'>) => void;
  onNotificationRead?: (envelope: RealtimeEnvelope<'notification.read'>) => void;
}

function resolveRealtimeBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000';
  }
  const { protocol, hostname, port, origin } = window.location;
  if (port === '5173' || port === '5174') {
    return `${protocol}//${hostname}:3000`;
  }
  return origin;
}

export function useRealtimeCase(options: UseRealtimeCaseOptions) {
  const {
    token,
    caseId,
    onCaseMessageCreated,
    onCaseMessageRead,
    onCaseSystemCreated,
    onNotificationCreated,
    onNotificationRead,
  } = options;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef({
    onCaseMessageCreated,
    onCaseMessageRead,
    onCaseSystemCreated,
    onNotificationCreated,
    onNotificationRead,
  });
  const caseIdRef = useRef<string | null>(caseId ?? null);

  useEffect(() => {
    caseIdRef.current = caseId ?? null;
    handlersRef.current = {
      onCaseMessageCreated,
      onCaseMessageRead,
      onCaseSystemCreated,
      onNotificationCreated,
      onNotificationRead,
    };
  }, [
    onCaseMessageCreated,
    onCaseMessageRead,
    onCaseSystemCreated,
    onNotificationCreated,
    onNotificationRead,
  ]);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(resolveRealtimeBaseUrl(), {
      path: '/api/realtime',
      transports: ['websocket'],
      auth: { token },
      query: { access_token: token },
      timeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 700,
    });

    socketRef.current = socket;
    setError(null);

    const subscribeCaseRoom = (nextCaseId: string) => {
      socket.timeout(5000).emit(
        'case.subscribe',
        { caseId: nextCaseId },
        (err: unknown, response: { ok?: boolean; error?: string } | undefined) => {
          if (err) {
            console.warn('[realtime] case.subscribe timeout/error', {
              caseId: nextCaseId,
              err: String(err),
            });
            return;
          }
          if (!response?.ok) {
            console.warn('[realtime] case.subscribe rejected', {
              caseId: nextCaseId,
              response,
            });
            return;
          }
          console.info('[realtime] case.subscribe ok', { caseId: nextCaseId });
        },
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      console.info('[realtime] connected', { socketId: socket.id, caseId: caseId ?? null });
      const nextCaseId = caseIdRef.current;
      if (nextCaseId) {
        subscribeCaseRoom(nextCaseId);
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      setError(err?.message ?? 'Realtime connection failed');
      setConnected(false);
    });

    socket.on('case.message.created', (envelope: RealtimeEnvelope<'case.message.created'>) => {
      handlersRef.current.onCaseMessageCreated?.(envelope);
    });
    socket.on('case.message.read', (envelope: RealtimeEnvelope<'case.message.read'>) => {
      handlersRef.current.onCaseMessageRead?.(envelope);
    });
    socket.on('case.system.created', (envelope: RealtimeEnvelope<'case.system.created'>) => {
      handlersRef.current.onCaseSystemCreated?.(envelope);
    });
    socket.on('notification.created', (envelope: RealtimeEnvelope<'notification.created'>) => {
      handlersRef.current.onNotificationCreated?.(envelope);
    });
    socket.on('notification.read', (envelope: RealtimeEnvelope<'notification.read'>) => {
      handlersRef.current.onNotificationRead?.(envelope);
    });
    socket.on('session.ready', () => {
      const nextCaseId = caseIdRef.current;
      if (!nextCaseId) return;
      subscribeCaseRoom(nextCaseId);
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [caseId, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    if (caseId) {
      socket.timeout(5000).emit(
        'case.subscribe',
        { caseId },
        (err: unknown, response: { ok?: boolean; error?: string } | undefined) => {
          if (err) {
            console.warn('[realtime] case.subscribe timeout/error', { caseId, err: String(err) });
            return;
          }
          if (!response?.ok) {
            console.warn('[realtime] case.subscribe rejected', { caseId, response });
            return;
          }
          console.info('[realtime] case.subscribe ok', { caseId });
        },
      );
      return () => {
        socket.emit('case.unsubscribe', { caseId });
      };
    }
    return;
  }, [caseId]);

  return {
    connected,
    error,
  };
}
