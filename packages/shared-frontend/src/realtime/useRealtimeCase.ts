import { useEffect, useMemo, useRef, useState } from 'react';
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

  const handlers = useMemo(
    () => ({
      onCaseMessageCreated,
      onCaseMessageRead,
      onCaseSystemCreated,
      onNotificationCreated,
      onNotificationRead,
    }),
    [
      onCaseMessageCreated,
      onCaseMessageRead,
      onCaseSystemCreated,
      onNotificationCreated,
      onNotificationRead,
    ],
  );

  useEffect(() => {
    if (!token) {
      setConnected(false);
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io('/', {
      path: '/api/realtime',
      transports: ['websocket'],
      auth: { token },
      query: { access_token: token },
      withCredentials: true,
    });

    socketRef.current = socket;
    setError(null);

    socket.on('connect', () => {
      setConnected(true);
      if (caseId) {
        socket.emit('case.subscribe', { caseId });
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
      handlers.onCaseMessageCreated?.(envelope);
    });
    socket.on('case.message.read', (envelope: RealtimeEnvelope<'case.message.read'>) => {
      handlers.onCaseMessageRead?.(envelope);
    });
    socket.on('case.system.created', (envelope: RealtimeEnvelope<'case.system.created'>) => {
      handlers.onCaseSystemCreated?.(envelope);
    });
    socket.on('notification.created', (envelope: RealtimeEnvelope<'notification.created'>) => {
      handlers.onNotificationCreated?.(envelope);
    });
    socket.on('notification.read', (envelope: RealtimeEnvelope<'notification.read'>) => {
      handlers.onNotificationRead?.(envelope);
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [caseId, handlers, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    if (caseId) {
      socket.emit('case.subscribe', { caseId });
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
