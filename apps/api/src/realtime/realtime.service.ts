import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { RealtimeEnvelope, RealtimeEventName } from './realtime.types.js';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attachServer(server: Server) {
    this.server = server;
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
    if (!this.server) return;
    this.server
      .to(`case:${caseId}`)
      .emit(event, this.buildEnvelope(event, data));
  }

  emitToUser<TEvent extends RealtimeEventName>(
    userId: string,
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    if (!this.server) return;
    this.server
      .to(`user:${userId}`)
      .emit(event, this.buildEnvelope(event, data));
  }

  emitToUsers<TEvent extends RealtimeEventName>(
    userIds: string[],
    event: TEvent,
    data: RealtimeEnvelope<TEvent>['data'],
  ) {
    if (!this.server) return;
    for (const userId of userIds) {
      this.emitToUser(userId, event, data);
    }
  }
}
