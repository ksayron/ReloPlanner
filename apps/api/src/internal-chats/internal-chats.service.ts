import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  DirectChatMessage,
  DirectChatMessageKind,
  DirectChatParticipant,
  DirectChatThread,
  Role,
} from '@reloplanner/shared-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { StartDirectChatDto } from './dto/start-direct-chat.dto.js';
import { PostDirectChatMessageDto } from './dto/post-direct-chat-message.dto.js';

type Actor = {
  id: string;
  role: Role;
};

@Injectable()
export class InternalChatsService {
  constructor(private readonly prisma: PrismaService) {}

  async listClients(actor: Actor) {
    this.assertInternal(actor.role);
    const rows = await this.prisma.user.findMany({
      where: {
        role: { in: ['USER', 'PREMIUM'] },
        isBlocked: false,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });
    return rows as DirectChatParticipant[];
  }

  async listThreads(actor: Actor) {
    this.assertInternal(actor.role);
    const where =
      actor.role === 'ADMIN' ? {} : { specialistUserId: actor.id };
    const rows = await (this.prisma as any).directChatThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { select: { id: true, email: true, displayName: true, role: true } },
        specialist: { select: { id: true, email: true, displayName: true, role: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, kind: true, content: true, createdAt: true },
        },
      },
    });

    return rows.map((row: any) => this.mapThread(row));
  }

  async startThread(actor: Actor, dto: StartDirectChatDto) {
    this.assertInternal(actor.role);
    const specialistUserId =
      actor.role === 'SPECIALIST' ? actor.id : dto.specialistUserId;
    if (!specialistUserId) {
      throw new BadRequestException('specialistUserId is required for admin');
    }

    const [clientUser, specialistUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.clientUserId },
        select: { id: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: specialistUserId },
        select: { id: true, role: true },
      }),
    ]);
    if (!clientUser || !['USER', 'PREMIUM'].includes(clientUser.role)) {
      throw new BadRequestException('Invalid client user');
    }
    if (!specialistUser || specialistUser.role !== 'SPECIALIST') {
      throw new BadRequestException('Invalid specialist user');
    }

    const thread = await (this.prisma as any).directChatThread.upsert({
      where: {
        clientUserId_specialistUserId: {
          clientUserId: dto.clientUserId,
          specialistUserId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        clientUserId: dto.clientUserId,
        specialistUserId,
      },
      include: {
        client: { select: { id: true, email: true, displayName: true, role: true } },
        specialist: { select: { id: true, email: true, displayName: true, role: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, kind: true, content: true, createdAt: true },
        },
      },
    });

    return this.mapThread(thread);
  }

  async listMessages(actor: Actor, threadId: string) {
    this.assertInternal(actor.role);
    const thread = await this.getThreadWithAccess(actor, threadId);
    const rows = await (this.prisma as any).directChatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, email: true, displayName: true, role: true } },
      },
      take: 500,
    });
    return rows.map((row: any) => this.mapMessage(row));
  }

  async postMessage(actor: Actor, threadId: string, dto: PostDirectChatMessageDto) {
    this.assertInternal(actor.role);
    const thread = await this.getThreadWithAccess(actor, threadId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Message cannot be empty');
    }
    const kind: DirectChatMessageKind =
      actor.role === 'SPECIALIST' || actor.role === 'ADMIN'
        ? 'SPECIALIST'
        : 'USER';

    const created = await this.prisma.$transaction(async (tx: any) => {
      const message = await tx.directChatMessage.create({
        data: {
          threadId: thread.id,
          authorUserId: actor.id,
          kind,
          content,
        },
        include: {
          author: { select: { id: true, email: true, displayName: true, role: true } },
        },
      });
      await tx.directChatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });
      return message;
    });

    return this.mapMessage(created);
  }

  private async getThreadWithAccess(actor: Actor, threadId: string) {
    const thread = await (this.prisma as any).directChatThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        specialistUserId: true,
      },
    });
    if (!thread) {
      throw new NotFoundException('Chat thread not found');
    }
    if (actor.role !== 'ADMIN' && thread.specialistUserId !== actor.id) {
      throw new ForbiddenException('No access to this chat thread');
    }
    return thread;
  }

  private assertInternal(role: Role) {
    if (role !== 'ADMIN' && role !== 'SPECIALIST') {
      throw new ForbiddenException('Only internal users can access direct chats');
    }
  }

  private mapThread(row: any): DirectChatThread {
    return {
      id: row.id,
      client: row.client,
      specialist: row.specialist,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      lastMessage: row.messages?.[0]
        ? {
            id: row.messages[0].id,
            kind: row.messages[0].kind,
            content: row.messages[0].content,
            createdAt: new Date(row.messages[0].createdAt).toISOString(),
          }
        : null,
    };
  }

  private mapMessage(row: any): DirectChatMessage {
    return {
      id: row.id,
      threadId: row.threadId,
      author: row.author,
      kind: row.kind,
      content: row.content,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
