import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CaseAttachedProfile,
  CaseMessage,
  CaseMessageKind,
  RelocationCaseStatus,
} from '@reloplanner/shared-contracts';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CreateCaseDto } from './dto/create-case.dto.js';
import { PostCaseMessageDto } from './dto/post-case-message.dto.js';
import { UpdateReadStateDto } from './dto/update-read-state.dto.js';

type CaseActor = {
  id: string;
  role: Role;
  email?: string;
};

type CaseStatus = RelocationCaseStatus;

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async createCase(actor: CaseActor, dto: CreateCaseDto) {
    this.assertClientRole(actor.role);
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: dto.profileId, userId: actor.id },
      select: { id: true },
    });
    if (!profile) {
      throw new BadRequestException('Selected profile does not belong to current user');
    }
    const existingCase = await (this.prisma as any).relocationCase.findFirst({
      where: {
        ownerUserId: actor.id,
        profileId: dto.profileId,
        status: { notIn: ['ARCHIVED', 'CANCELED', 'COMPLETED'] },
      },
      select: { id: true },
    });
    if (existingCase) {
      throw new BadRequestException('This profile is already attached to an active case');
    }

    const created = await this.prisma.$transaction(async (tx: any) => {
      const caseRow = await tx.relocationCase.create({
        data: {
          ownerUserId: actor.id,
          profileId: dto.profileId,
          title: dto.title.trim(),
          additionalNotes: dto.additionalNotes?.trim() ?? null,
          status: 'DRAFT',
        },
      });
      await tx.caseReadState.create({
        data: {
          caseId: caseRow.id,
          userId: actor.id,
          unreadCount: 0,
        },
      });
      await tx.caseActivity.create({
        data: {
          caseId: caseRow.id,
          actorUserId: actor.id,
          type: 'CASE_CREATED',
          statusTo: 'DRAFT',
          metadata: { title: caseRow.title },
        },
      });
      return caseRow;
    });

    return this.getCase(actor, created.id);
  }

  async listCases(actor: CaseActor) {
    const where =
      actor.role === 'ADMIN'
        ? {}
        : actor.role === 'SPECIALIST'
          ? { status: { in: ['SUBMITTED', 'IN_PROGRESS', 'NEEDS_USER_INPUT'] } }
          : { ownerUserId: actor.id };

    const rows = await (this.prisma as any).relocationCase.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, email: true, displayName: true } },
        specialist: { select: { id: true, email: true, displayName: true } },
        profile: {
          select: {
            id: true,
            desiredRole: true,
            targetCountry: true,
            targetCity: true,
            yearsExperience: true,
          },
        },
        readStates: {
          where: { userId: actor.id },
          select: { unreadCount: true, lastReadAt: true },
        },
        _count: {
          select: { messages: true, activities: true },
        },
      },
    });

    return rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      additionalNotes: row.additionalNotes ?? null,
      profileId: row.profileId ?? null,
      profile: row.profile ? this.mapProfile(row.profile) : null,
      status: row.status,
      owner: row.owner,
      specialist: row.specialist ?? null,
      unreadCount: Number(row.readStates?.[0]?.unreadCount ?? 0),
      lastReadAt: row.readStates?.[0]?.lastReadAt
        ? new Date(row.readStates[0].lastReadAt).toISOString()
        : null,
      messageCount: Number(row._count?.messages ?? 0),
      activityCount: Number(row._count?.activities ?? 0),
      submittedAt: row.submittedAt
        ? new Date(row.submittedAt).toISOString()
        : null,
      archivedAt: row.archivedAt
        ? new Date(row.archivedAt).toISOString()
        : null,
      canceledAt: row.canceledAt
        ? new Date(row.canceledAt).toISOString()
        : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async getCase(actor: CaseActor, caseId: string) {
    const caseRow = await this.findCaseForActor(actor, caseId);
    const [messages, activities, readStates] = await Promise.all([
      (this.prisma as any).caseMessage.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: {
          author: {
            select: { id: true, email: true, displayName: true, role: true },
          },
        },
      }),
      (this.prisma as any).caseActivity.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
        include: {
          actor: {
            select: { id: true, email: true, displayName: true, role: true },
          },
        },
      }),
      (this.prisma as any).caseReadState.findMany({
        where: { caseId },
        include: {
          user: {
            select: { id: true, email: true, displayName: true, role: true },
          },
        },
      }),
    ]);

    return {
      id: caseRow.id,
      title: caseRow.title,
      additionalNotes: caseRow.additionalNotes ?? null,
      profileId: caseRow.profileId ?? null,
      profile: caseRow.profile ? this.mapProfile(caseRow.profile) : null,
      status: caseRow.status,
      owner: caseRow.owner,
      specialist: caseRow.specialist ?? null,
      submittedAt: caseRow.submittedAt
        ? new Date(caseRow.submittedAt).toISOString()
        : null,
      archivedAt: caseRow.archivedAt
        ? new Date(caseRow.archivedAt).toISOString()
        : null,
      canceledAt: caseRow.canceledAt
        ? new Date(caseRow.canceledAt).toISOString()
        : null,
      createdAt: new Date(caseRow.createdAt).toISOString(),
      updatedAt: new Date(caseRow.updatedAt).toISOString(),
      messages: messages.map((row: any) => this.mapMessage(row)),
      activities: activities.map((row: any) => ({
        id: row.id,
        type: row.type,
        actor: row.actor ?? null,
        statusFrom: row.statusFrom ?? null,
        statusTo: row.statusTo ?? null,
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : null,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      readStates: readStates.map((row: any) => ({
        user: row.user,
        lastReadMessageId: row.lastReadMessageId ?? null,
        lastReadAt: row.lastReadAt
          ? new Date(row.lastReadAt).toISOString()
          : null,
        unreadCount: Number(row.unreadCount),
        updatedAt: new Date(row.updatedAt).toISOString(),
      })),
    };
  }

  async submitCase(actor: CaseActor, caseId: string) {
    this.assertClientRole(actor.role);
    const caseRow = await this.findCaseForActor(actor, caseId, {
      ownerWrite: true,
    });
    if (!['DRAFT', 'NEEDS_USER_INPUT'].includes(caseRow.status)) {
      throw new BadRequestException(
        'Case cannot be submitted from current status',
      );
    }
    await this.changeCaseStatus({
      caseId,
      actor,
      nextStatus: 'SUBMITTED',
      activityType: 'CASE_SUBMITTED',
      systemMessage: 'Case was submitted for specialist review.',
    });
    return this.getCase(actor, caseId);
  }

  async archiveCase(actor: CaseActor, caseId: string) {
    const caseRow = await this.findCaseForActor(actor, caseId, {
      ownerWrite: true,
    });
    if (caseRow.status === 'ARCHIVED') {
      return this.getCase(actor, caseId);
    }
    await this.changeCaseStatus({
      caseId,
      actor,
      nextStatus: 'ARCHIVED',
      activityType: 'CASE_ARCHIVED',
      systemMessage: 'Case was archived by the owner.',
      setArchivedAt: true,
    });
    return this.getCase(actor, caseId);
  }

  async cancelCase(actor: CaseActor, caseId: string) {
    const caseRow = await this.findCaseForActor(actor, caseId, {
      ownerWrite: true,
    });
    if (['ARCHIVED', 'COMPLETED'].includes(caseRow.status)) {
      throw new BadRequestException(
        'Archived or completed case cannot be canceled',
      );
    }
    await this.changeCaseStatus({
      caseId,
      actor,
      nextStatus: 'CANCELED',
      activityType: 'CASE_CANCELED',
      systemMessage: 'Case was canceled by the owner.',
      setCanceledAt: true,
    });
    return this.getCase(actor, caseId);
  }

  async assignToSelf(actor: CaseActor, caseId: string) {
    if (actor.role !== 'SPECIALIST') {
      throw new ForbiddenException('Only specialists can self-assign cases');
    }
    const caseRow = await this.findCaseStrict(caseId);
    if (['ARCHIVED', 'CANCELED', 'COMPLETED'].includes(caseRow.status)) {
      throw new BadRequestException('Cannot assign closed case');
    }
    if (caseRow.specialistUserId && caseRow.specialistUserId !== actor.id) {
      throw new BadRequestException('Case is already assigned to another specialist');
    }
    if (caseRow.specialistUserId === actor.id) {
      return this.getCase(actor, caseId);
    }
    await this.applySpecialistAssignment({
      actor,
      caseRow,
      specialistUserId: actor.id,
      specialistEmail: actor.email ?? 'specialist',
      reassign: false,
    });
    return this.getCase(actor, caseId);
  }

  async assignSpecialist(
    actor: CaseActor,
    caseId: string,
    specialistUserId: string,
  ) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only admin can assign specialists');
    }
    const caseRow = await this.findCaseStrict(caseId);
    if (['ARCHIVED', 'CANCELED', 'COMPLETED'].includes(caseRow.status)) {
      throw new BadRequestException('Cannot assign specialist to closed case');
    }
    const specialist = await this.requireSpecialistUser(specialistUserId);
    if (caseRow.specialistUserId) {
      throw new BadRequestException('Case already has assigned specialist');
    }
    await this.applySpecialistAssignment({
      actor,
      caseRow,
      specialistUserId,
      specialistEmail: specialist.email,
      reassign: false,
    });
    return this.getCase(actor, caseId);
  }

  async reassignSpecialist(
    actor: CaseActor,
    caseId: string,
    specialistUserId: string,
  ) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only admin can reassign specialists');
    }
    const caseRow = await this.findCaseStrict(caseId);
    if (['ARCHIVED', 'CANCELED', 'COMPLETED'].includes(caseRow.status)) {
      throw new BadRequestException(
        'Cannot reassign specialist for closed case',
      );
    }
    const specialist = await this.requireSpecialistUser(specialistUserId);
    if (!caseRow.specialistUserId) {
      throw new BadRequestException('Case has no specialist to reassign');
    }
    if (caseRow.specialistUserId === specialistUserId) {
      return this.getCase(actor, caseId);
    }
    await this.applySpecialistAssignment({
      actor,
      caseRow,
      specialistUserId,
      specialistEmail: specialist.email,
      reassign: true,
    });
    return this.getCase(actor, caseId);
  }

  async listMessages(actor: CaseActor, caseId: string) {
    await this.findCaseForActor(actor, caseId);
    const rows = await (this.prisma as any).caseMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      include: {
        author: {
          select: { id: true, email: true, displayName: true, role: true },
        },
      },
    });
    return rows.map((row: any) => this.mapMessage(row));
  }

  async postMessage(actor: CaseActor, caseId: string, dto: PostCaseMessageDto) {
    const caseRow = await this.findCaseForActor(actor, caseId);
    if (actor.role === 'SPECIALIST' && caseRow.specialistUserId !== actor.id) {
      throw new ForbiddenException('Assign case to yourself before replying in chat');
    }
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (['ARCHIVED', 'CANCELED'].includes(caseRow.status)) {
      throw new BadRequestException('Cannot post messages to closed cases');
    }

    const participants = this.collectParticipantIds(caseRow);
    const kind = this.messageKindForRole(actor.role);

    const created = await this.prisma.$transaction(async (tx: any) => {
      const message = await tx.caseMessage.create({
        data: {
          caseId,
          authorUserId: actor.id,
          kind,
          content,
        },
        include: {
          author: {
            select: { id: true, email: true, displayName: true, role: true },
          },
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId,
          actorUserId: actor.id,
          type: 'MESSAGE_POSTED',
          metadata: { kind },
        },
      });

      await this.bumpUnreadForRecipients(
        tx,
        caseId,
        participants,
        actor.id,
        message.id,
      );

      return message;
    });

    const messageDto = this.mapMessage(created);
    this.realtime.emitToCase(caseId, 'case.message.created', messageDto);

    await this.notifications.createNotifications(
      participants
        .filter((id) => id !== actor.id)
        .map((userId) => ({
          userId,
          caseId,
          type: 'CASE_MESSAGE' as const,
          title: 'New case message',
          body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
          metadata: { caseId, messageId: created.id },
        })),
    );

    return messageDto;
  }

  async getReadState(actor: CaseActor, caseId: string) {
    await this.findCaseForActor(actor, caseId);
    const rows = await (this.prisma as any).caseReadState.findMany({
      where: { caseId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, role: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row: any) => ({
      user: row.user,
      lastReadMessageId: row.lastReadMessageId ?? null,
      lastReadAt: row.lastReadAt
        ? new Date(row.lastReadAt).toISOString()
        : null,
      unreadCount: Number(row.unreadCount),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async updateReadState(
    actor: CaseActor,
    caseId: string,
    dto: UpdateReadStateDto,
  ) {
    await this.findCaseForActor(actor, caseId);
    const lastMessage = dto.lastReadMessageId
      ? await (this.prisma as any).caseMessage.findFirst({
          where: { id: dto.lastReadMessageId, caseId },
        })
      : await (this.prisma as any).caseMessage.findFirst({
          where: { caseId },
          orderBy: { createdAt: 'desc' },
        });

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const row = await tx.caseReadState.upsert({
        where: {
          caseId_userId: { caseId, userId: actor.id },
        },
        update: {
          lastReadMessageId: lastMessage?.id ?? null,
          lastReadAt: new Date(),
          unreadCount: 0,
        },
        create: {
          caseId,
          userId: actor.id,
          lastReadMessageId: lastMessage?.id ?? null,
          lastReadAt: new Date(),
          unreadCount: 0,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId,
          actorUserId: actor.id,
          type: 'MESSAGE_READ',
          metadata: { lastReadMessageId: lastMessage?.id ?? null },
        },
      });

      return row;
    });

    const payload = {
      caseId,
      userId: actor.id,
      lastReadMessageId: updated.lastReadMessageId ?? null,
      lastReadAt: updated.lastReadAt
        ? new Date(updated.lastReadAt).toISOString()
        : null,
      unreadCount: Number(updated.unreadCount),
    };
    this.realtime.emitToCase(caseId, 'case.message.read', payload);
    return payload;
  }

  private async changeCaseStatus(input: {
    caseId: string;
    actor: CaseActor;
    nextStatus: CaseStatus;
    activityType: 'CASE_SUBMITTED' | 'CASE_ARCHIVED' | 'CASE_CANCELED';
    systemMessage: string;
    setArchivedAt?: boolean;
    setCanceledAt?: boolean;
  }) {
    const caseRow = await this.findCaseStrict(input.caseId);
    const previousStatus = caseRow.status as CaseStatus;
    const participants = this.collectParticipantIds(caseRow);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const updatedCase = await tx.relocationCase.update({
        where: { id: input.caseId },
        data: {
          status: input.nextStatus,
          submittedAt:
            input.nextStatus === 'SUBMITTED' ? new Date() : caseRow.submittedAt,
          archivedAt: input.setArchivedAt ? new Date() : caseRow.archivedAt,
          canceledAt: input.setCanceledAt ? new Date() : caseRow.canceledAt,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: input.caseId,
          actorUserId: input.actor.id,
          type: input.activityType,
          statusFrom: previousStatus,
          statusTo: input.nextStatus,
        },
      });
      await tx.caseActivity.create({
        data: {
          caseId: input.caseId,
          actorUserId: input.actor.id,
          type: 'CASE_STATUS_CHANGED',
          statusFrom: previousStatus,
          statusTo: input.nextStatus,
        },
      });

      const message = await tx.caseMessage.create({
        data: {
          caseId: input.caseId,
          kind: 'SYSTEM',
          content: input.systemMessage,
          metadata: {
            statusFrom: previousStatus,
            statusTo: input.nextStatus,
          },
        },
      });

      await this.bumpUnreadForRecipients(
        tx,
        input.caseId,
        participants,
        null,
        message.id,
      );

      return { updatedCase, message };
    });

    const messagePayload: CaseMessage = {
      id: result.message.id,
      caseId: input.caseId,
      author: null,
      kind: 'SYSTEM' as CaseMessageKind,
      content: result.message.content,
      metadata:
        result.message.metadata && typeof result.message.metadata === 'object'
          ? (result.message.metadata as Record<string, unknown>)
          : null,
      createdAt: new Date(result.message.createdAt).toISOString(),
    };
    this.realtime.emitToCase(
      input.caseId,
      'case.system.created',
      messagePayload,
    );

    await this.notifications.createNotifications(
      participants
        .filter((userId) => userId !== input.actor.id)
        .map((userId) => ({
          userId,
          caseId: input.caseId,
          type: 'CASE_STATUS_CHANGED' as const,
          title: 'Case status updated',
          body: `Status changed to ${input.nextStatus.replaceAll('_', ' ')}`,
          metadata: { caseId: input.caseId, status: input.nextStatus },
        })),
    );
  }

  private async applySpecialistAssignment(input: {
    actor: CaseActor;
    caseRow: any;
    specialistUserId: string;
    specialistEmail: string;
    reassign: boolean;
  }) {
    const participantsBefore = this.collectParticipantIds(input.caseRow);
    const previousSpecialistUserId = input.caseRow.specialistUserId as
      | string
      | null;

    const result = await this.prisma.$transaction(async (tx: any) => {
      const nextStatus: CaseStatus =
        input.caseRow.status === 'SUBMITTED'
          ? 'IN_PROGRESS'
          : (input.caseRow.status as CaseStatus);

      const updatedCase = await tx.relocationCase.update({
        where: { id: input.caseRow.id },
        data: {
          specialistUserId: input.specialistUserId,
          status: nextStatus,
        },
      });

      await tx.caseReadState.upsert({
        where: {
          caseId_userId: {
            caseId: input.caseRow.id,
            userId: input.specialistUserId,
          },
        },
        update: {},
        create: {
          caseId: input.caseRow.id,
          userId: input.specialistUserId,
          unreadCount: 0,
        },
      });

      await tx.caseActivity.create({
        data: {
          caseId: input.caseRow.id,
          actorUserId: input.actor.id,
          type: input.reassign
            ? 'SPECIALIST_REASSIGNED'
            : 'SPECIALIST_ASSIGNED',
          metadata: {
            specialistUserId: input.specialistUserId,
            previousSpecialistUserId,
          },
        },
      });

      const message = await tx.caseMessage.create({
        data: {
          caseId: input.caseRow.id,
          kind: 'SYSTEM',
          content: input.reassign
            ? `Specialist was reassigned to ${input.specialistEmail}.`
            : `Specialist ${input.specialistEmail} was assigned to this case.`,
          metadata: {
            specialistUserId: input.specialistUserId,
            previousSpecialistUserId,
          },
        },
      });

      const participantsAfter = this.collectParticipantIds({
        ...input.caseRow,
        specialistUserId: input.specialistUserId,
      });
      await this.bumpUnreadForRecipients(
        tx,
        input.caseRow.id,
        participantsAfter,
        null,
        message.id,
      );

      return { updatedCase, message, participantsAfter };
    });

    const messagePayload: CaseMessage = {
      id: result.message.id,
      caseId: input.caseRow.id,
      author: null,
      kind: 'SYSTEM' as CaseMessageKind,
      content: result.message.content,
      metadata:
        result.message.metadata && typeof result.message.metadata === 'object'
          ? (result.message.metadata as Record<string, unknown>)
          : null,
      createdAt: new Date(result.message.createdAt).toISOString(),
    };
    this.realtime.emitToCase(
      input.caseRow.id,
      'case.system.created',
      messagePayload,
    );

    const notificationRecipients = new Set<string>([
      ...participantsBefore,
      ...result.participantsAfter,
    ]);
    notificationRecipients.delete(input.actor.id);

    await this.notifications.createNotifications(
      [...notificationRecipients].map((userId) => ({
        userId,
        caseId: input.caseRow.id,
        type: input.reassign ? 'CASE_REASSIGNED' : 'CASE_ASSIGNED',
        title: input.reassign
          ? 'Case specialist reassigned'
          : 'Case specialist assigned',
        body: input.reassign
          ? `Specialist was reassigned to ${input.specialistEmail}.`
          : `Specialist ${input.specialistEmail} was assigned.`,
        metadata: {
          caseId: input.caseRow.id,
          specialistUserId: input.specialistUserId,
        },
      })),
    );
  }

  private async bumpUnreadForRecipients(
    tx: any,
    caseId: string,
    participants: string[],
    authorUserId: string | null,
    lastMessageId: string,
  ) {
    const uniqueRecipients = [...new Set(participants)].filter(
      (userId) => userId && userId !== authorUserId,
    );
    for (const userId of uniqueRecipients) {
      await tx.caseReadState.upsert({
        where: { caseId_userId: { caseId, userId } },
        update: {
          unreadCount: { increment: 1 },
        },
        create: {
          caseId,
          userId,
          unreadCount: 1,
        },
      });
    }

    if (authorUserId) {
      await tx.caseReadState.upsert({
        where: { caseId_userId: { caseId, userId: authorUserId } },
        update: {
          lastReadMessageId: lastMessageId,
          lastReadAt: new Date(),
          unreadCount: 0,
        },
        create: {
          caseId,
          userId: authorUserId,
          lastReadMessageId: lastMessageId,
          lastReadAt: new Date(),
          unreadCount: 0,
        },
      });
    }
  }

  private messageKindForRole(role: Role) {
    if (role === 'SPECIALIST' || role === 'ADMIN') {
      return 'SPECIALIST' as const;
    }
    return 'USER' as const;
  }

  private collectParticipantIds(caseRow: {
    ownerUserId: string;
    specialistUserId?: string | null;
  }) {
    return [
      caseRow.ownerUserId,
      ...(caseRow.specialistUserId ? [caseRow.specialistUserId] : []),
    ];
  }

  private mapProfile(row: {
    id: string;
    desiredRole: string;
    targetCountry: string;
    targetCity: string | null;
    yearsExperience: number;
  }): CaseAttachedProfile {
    return {
      id: row.id,
      desiredRole: row.desiredRole,
      targetCountry: row.targetCountry,
      targetCity: row.targetCity,
      yearsExperience: row.yearsExperience,
    };
  }

  private mapMessage(row: any): CaseMessage {
    return {
      id: row.id,
      caseId: row.caseId,
      author: row.author ?? null,
      kind: row.kind as CaseMessageKind,
      content: row.content,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private assertClientRole(role: Role) {
    if (role !== 'USER' && role !== 'PREMIUM') {
      throw new ForbiddenException(
        'Only client users can create or submit cases',
      );
    }
  }

  private async requireSpecialistUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!user) {
      throw new NotFoundException('Specialist user not found');
    }
    if (user.role !== 'SPECIALIST') {
      throw new BadRequestException('Assigned user must have SPECIALIST role');
    }
    return user;
  }

  private async findCaseStrict(caseId: string) {
    const caseRow = await (this.prisma as any).relocationCase.findUnique({
      where: { id: caseId },
      include: {
        owner: {
          select: { id: true, email: true, displayName: true, role: true },
        },
        specialist: {
          select: { id: true, email: true, displayName: true, role: true },
        },
        profile: {
          select: {
            id: true,
            desiredRole: true,
            targetCountry: true,
            targetCity: true,
            yearsExperience: true,
          },
        },
      },
    });
    if (!caseRow) {
      throw new NotFoundException('Case not found');
    }
    return caseRow;
  }

  private async findCaseForActor(
    actor: CaseActor,
    caseId: string,
    options?: { ownerWrite?: boolean },
  ) {
    const caseRow = await this.findCaseStrict(caseId);
    const isOwner = caseRow.ownerUserId === actor.id;
    const isSpecialist = caseRow.specialistUserId === actor.id;
    const isAdmin = actor.role === 'ADMIN';
    const isSpecialistPoolAccess =
      actor.role === 'SPECIALIST' &&
      ['SUBMITTED', 'IN_PROGRESS', 'NEEDS_USER_INPUT'].includes(
        caseRow.status as string,
      );
    if (!isOwner && !isSpecialist && !isAdmin && !isSpecialistPoolAccess) {
      throw new ForbiddenException('No access to this case');
    }
    if (options?.ownerWrite && !isOwner) {
      throw new ForbiddenException('Only owner can modify this case state');
    }
    return caseRow;
  }
}
