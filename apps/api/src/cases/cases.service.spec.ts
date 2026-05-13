import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CasesService } from './cases.service.js';

function createService() {
  const prisma = {
    $transaction: jest.fn(),
    relocationCase: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const notifications = {
    createNotifications: jest.fn().mockResolvedValue([]),
  };
  const realtime = {
    emitToCase: jest.fn(),
  };

  return {
    prisma,
    notifications,
    realtime,
    service: new CasesService(
      prisma as never,
      notifications as never,
      realtime as never,
    ),
  };
}

describe('CasesService', () => {
  it('allows create/submit only for client roles', async () => {
    const { service } = createService();

    await expect(
      service.createCase(
        { id: 'admin-1', role: 'ADMIN', email: 'admin@x.dev' },
        { title: 'Case', profileId: 'profile-1', additionalNotes: 'desc' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces owner-only lifecycle mutation checks', async () => {
    const { prisma, service } = createService();
    prisma.relocationCase.findUnique.mockResolvedValue({
      id: 'case-1',
      ownerUserId: 'owner-1',
      specialistUserId: 'specialist-1',
      status: 'SUBMITTED',
      owner: {
        id: 'owner-1',
        email: 'owner@x.dev',
        displayName: null,
        role: 'USER',
      },
      specialist: {
        id: 'specialist-1',
        email: 'spec@x.dev',
        displayName: null,
        role: 'SPECIALIST',
      },
    });

    await expect(
      service.archiveCase(
        { id: 'admin-1', role: 'ADMIN', email: 'admin@x.dev' },
        'case-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks specialist assignment for closed cases', async () => {
    const { prisma, service } = createService();
    prisma.relocationCase.findUnique.mockResolvedValue({
      id: 'case-closed',
      ownerUserId: 'owner-1',
      specialistUserId: null,
      status: 'ARCHIVED',
      owner: {
        id: 'owner-1',
        email: 'owner@x.dev',
        displayName: null,
        role: 'USER',
      },
      specialist: null,
    });

    await expect(
      service.assignSpecialist(
        { id: 'admin-1', role: 'ADMIN', email: 'admin@x.dev' },
        'case-closed',
        'specialist-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires assigned user to be specialist role', async () => {
    const { prisma, service } = createService();
    prisma.relocationCase.findUnique.mockResolvedValue({
      id: 'case-1',
      ownerUserId: 'owner-1',
      specialistUserId: null,
      status: 'SUBMITTED',
      owner: {
        id: 'owner-1',
        email: 'owner@x.dev',
        displayName: null,
        role: 'USER',
      },
      specialist: null,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: 'USER',
      email: 'user@x.dev',
    });

    await expect(
      service.assignSpecialist(
        { id: 'admin-1', role: 'ADMIN', email: 'admin@x.dev' },
        'case-1',
        'user-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks posting messages to archived cases', async () => {
    const { prisma, service } = createService();
    prisma.relocationCase.findUnique.mockResolvedValue({
      id: 'case-1',
      ownerUserId: 'owner-1',
      specialistUserId: 'specialist-1',
      status: 'ARCHIVED',
      owner: {
        id: 'owner-1',
        email: 'owner@x.dev',
        displayName: null,
        role: 'USER',
      },
      specialist: {
        id: 'specialist-1',
        email: 'spec@x.dev',
        displayName: null,
        role: 'SPECIALIST',
      },
    });

    await expect(
      service.postMessage(
        { id: 'owner-1', role: 'USER', email: 'owner@x.dev' },
        'case-1',
        { content: 'hello' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
