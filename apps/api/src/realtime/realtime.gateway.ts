import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from './realtime.service.js';
import type { RealtimeUserContext } from './realtime.types.js';

type AuthedSocket = Socket & {
  data: Socket['data'] & { user?: RealtimeUserContext };
};

@WebSocketGateway({
  path: '/api/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtimeService.attachServer(server);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<{
        sub: string;
        role: Role;
        email?: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, email: true, isBlocked: true },
      });
      if (!user || user.isBlocked) {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        role: user.role,
        email: user.email,
      };
      client.join(`user:${user.id}`);

      client.emit(
        'session.ready',
        this.realtimeService.buildEnvelope('session.ready', {
          userId: user.id,
          role: user.role,
          connectedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      this.logger.warn(`Realtime auth failed: ${String(error)}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('case.subscribe')
  async subscribeCase(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { caseId?: string },
  ) {
    const user = client.data.user;
    if (!user || !payload?.caseId) {
      return { ok: false, error: 'Invalid subscription payload' };
    }

    const allowed = await this.canAccessCase(
      user.id,
      user.role,
      payload.caseId,
    );
    if (!allowed) {
      return { ok: false, error: 'No access to case' };
    }
    client.join(`case:${payload.caseId}`);
    return { ok: true };
  }

  @SubscribeMessage('case.unsubscribe')
  unsubscribeCase(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { caseId?: string },
  ) {
    if (!payload?.caseId) {
      return { ok: false, error: 'Invalid unsubscription payload' };
    }
    client.leave(`case:${payload.caseId}`);
    return { ok: true };
  }

  private extractToken(client: AuthedSocket): string | null {
    const authToken =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : null;
    if (authToken) {
      return authToken;
    }
    const queryToken =
      typeof client.handshake.query?.access_token === 'string'
        ? client.handshake.query.access_token
        : null;
    if (queryToken) {
      return queryToken;
    }
    const header = client.handshake.headers.authorization;
    if (
      typeof header === 'string' &&
      header.toLowerCase().startsWith('bearer ')
    ) {
      return header.slice(7).trim();
    }
    return null;
  }

  private async canAccessCase(userId: string, role: Role, caseId: string) {
    if (role === 'ADMIN') return true;
    const relocationCase = await (this.prisma as any).relocationCase.findUnique(
      {
        where: { id: caseId },
        select: {
          ownerUserId: true,
          specialistUserId: true,
          status: true,
        },
      },
    );
    if (!relocationCase) return false;
    if (relocationCase.ownerUserId === userId) return true;
    if (relocationCase.specialistUserId === userId) return true;
    if (
      role === 'SPECIALIST' &&
      ['SUBMITTED', 'IN_PROGRESS', 'NEEDS_USER_INPUT'].includes(relocationCase.status)
    ) {
      return true;
    }
    return false;
  }
}
