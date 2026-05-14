import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { RealtimeEnvelope, RealtimeEventName } from './realtime.types.js';

interface RealtimeEmitMetric {
  at: string;
  event: RealtimeEventName;
  target: string;
  recipients: number;
}

interface RealtimeFailureMetric {
  at: string;
  event: RealtimeEventName;
  target: string;
  error: string;
}

export interface RealtimeMonitoringSnapshot {
  serverAttached: boolean;
  activeConnections: number;
  recentEmits: RealtimeEmitMetric[];
  recentFailures: RealtimeFailureMetric[];
}

@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private readonly recentEmits: RealtimeEmitMetric[] = [];
  private readonly recentFailures: RealtimeFailureMetric[] = [];
  private readonly maxRecentMetrics = 30;

  attachServer(server: Server) {
    this.server = server;
  }

  getMonitoringSnapshot(): RealtimeMonitoringSnapshot {
    return {
      serverAttached: this.server !== null,
      activeConnections: this.server?.sockets.sockets.size ?? 0,
      recentEmits: [...this.recentEmits],
      recentFailures: [...this.recentFailures],
    };
  }

  buildEnvelope<TEvent extends RealtimeEventName>(
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ): RealtimeEnvelope<TEvent> {
    return {
      event,
      data,
      at: new Date().toISOString(),
    };
  }

  emitToCase<TEvent extends RealtimeEventName>(
    caseId: string,
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    this.emitToRoom(`case:${caseId}`, event, data, 1);
  }

  emitToUser<TEvent extends RealtimeEventName>(
    userId: string,
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    this.emitToRoom(`user:${userId}`, event, data, 1);
  }

  emitToUsers<TEvent extends RealtimeEventName>(
    userIds: string[],
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    if (!this.server) {
      this.recordFailure({
        at: new Date().toISOString(),
        event,
        target: 'users:*',
        error: 'Realtime server is not attached',
      });
      return;
    }
    for (const userId of userIds) {
      this.emitToUser(userId, event, data);
    }
  }

  emitToAdminMonitoring<TEvent extends RealtimeEventName>(
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    this.emitToRoom('admin:system-monitoring', event, data, 1);
  }

  private emitToRoom<TEvent extends RealtimeEventName>(
    target: string,
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
    recipients: number,
  ) {
    if (!this.server) {
      this.recordFailure({
        at: new Date().toISOString(),
        event,
        target,
        error: 'Realtime server is not attached',
      });
      return;
    }

    try {
      this.server.to(target).emit(event, this.buildEnvelope(event, data));
      this.recordEmit({
        at: new Date().toISOString(),
        event,
        target,
        recipients,
      });
    } catch (error: unknown) {
      this.recordFailure({
        at: new Date().toISOString(),
        event,
        target,
        error: error instanceof Error ? error.message : 'Unknown emit failure',
      });
    }
  }

  private recordEmit(item: RealtimeEmitMetric) {
    this.recentEmits.unshift(item);
    if (this.recentEmits.length > this.maxRecentMetrics) {
      this.recentEmits.length = this.maxRecentMetrics;
    }
  }

  private recordFailure(item: RealtimeFailureMetric) {
    this.recentFailures.unshift(item);
    if (this.recentFailures.length > this.maxRecentMetrics) {
      this.recentFailures.length = this.maxRecentMetrics;
    }
  }
}
