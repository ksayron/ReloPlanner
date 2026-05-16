import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  NotificationItem,
  NotificationType,
} from '@reloplanner/shared-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async listMyNotifications(userId: string, limit = 50) {
    const rows = await (this.prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    });

    return rows.map((row: any) => this.toDto(row));
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await (this.prisma as any).notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await (this.prisma as any).notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    const dto = this.toDto(updated);
    this.realtime.emitToUser(userId, 'notification.read', dto);
    return dto;
  }

  async markAllRead(userId: string) {
    const unreadRows = await (this.prisma as any).notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    await (this.prisma as any).notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    for (const row of unreadRows) {
      const payload = this.toDto({
        ...row,
        isRead: true,
        readAt: new Date(),
      });
      this.realtime.emitToUser(userId, 'notification.read', payload);
    }
    return { ok: true };
  }

  async createNotification(input: {
    userId: string;
    caseId?: string | null;
    type:
      | 'CASE_ASSIGNED'
      | 'CASE_REASSIGNED'
      | 'CASE_STATUS_CHANGED'
      | 'CASE_MESSAGE'
      | 'CASE_SYSTEM';
    title: string;
    body: string;
    metadata?: Record<string, unknown> | null;
  }) {
    const created = await (this.prisma as any).notification.create({
      data: {
        userId: input.userId,
        caseId: input.caseId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata ?? null,
      },
    });

    const dto = this.toDto(created);
    this.realtime.emitToUser(input.userId, 'notification.created', dto);
    return dto;
  }

  async createNotifications(
    inputs: Array<{
      userId: string;
      caseId?: string | null;
      type:
        | 'CASE_ASSIGNED'
        | 'CASE_REASSIGNED'
        | 'CASE_STATUS_CHANGED'
        | 'CASE_MESSAGE'
        | 'CASE_SYSTEM';
      title: string;
      body: string;
      metadata?: Record<string, unknown> | null;
    }>,
  ) {
    const results = [];
    for (const input of inputs) {
      results.push(await this.createNotification(input));
    }
    return results;
  }

  private toDto(row: any): NotificationItem {
    return {
      id: row.id as string,
      userId: row.userId as string,
      caseId: (row.caseId as string | null) ?? null,
      type: row.type as NotificationType,
      title: row.title as string,
      body: row.body as string,
      isRead: Boolean(row.isRead),
      readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : null,
    };
  }
}
