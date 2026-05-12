import { ConflictException } from '@nestjs/common';
import { AuthService, OAuthFlowError } from './auth.service.js';

describe('AuthService OAuth flow', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
    };
    config = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new AuthService(prisma as never, jwt as never, config as never);
  });

  it('returns exchange code for already linked githubId', async () => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { githubId?: string; id?: string } }) => {
      if (where.githubId) {
        return {
          id: 'user-1',
          email: 'user@example.com',
          role: 'USER',
          githubId: 'gh-1',
          githubLogin: 'old-login',
        };
      }
      if (where.id) {
        return {
          id: 'user-1',
          email: 'user@example.com',
          role: 'USER',
        };
      }
      return null;
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      githubId: 'gh-1',
      githubLogin: 'new-login',
    });

    const state = service.createGithubAuthState('/wizard');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-1',
      username: 'new-login',
      emails: [{ value: 'user@example.com', verified: true }],
    });

    expect(resolved.type).toBe('exchange');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('auto-links existing user by email when githubId is not linked', async () => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { githubId?: string; email?: string } }) => {
      if (where.githubId) {
        return null;
      }
      if (where.email) {
        return {
          id: 'user-2',
          email: 'user@example.com',
          role: 'USER',
          githubId: null,
          githubLogin: null,
        };
      }
      return null;
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-2',
      email: 'user@example.com',
      role: 'USER',
      githubId: 'gh-2',
      githubLogin: 'gh-login',
    });

    const state = service.createGithubAuthState('/wizard');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-2',
      username: 'gh-login',
      emails: [{ value: 'user@example.com', verified: true }],
    });

    expect(resolved.type).toBe('exchange');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-2' },
        data: expect.objectContaining({
          githubId: 'gh-2',
          githubLogin: 'gh-login',
        }),
      }),
    );
  });

  it('creates a new user when no github or email match exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-3',
      email: 'new@example.com',
      role: 'USER',
      githubId: 'gh-3',
      githubLogin: 'new-gh',
    });

    const state = service.createGithubAuthState('/wizard');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-3',
      username: 'new-gh',
      emails: [{ value: 'new@example.com', verified: true }],
    });

    expect(resolved.type).toBe('exchange');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.com',
          githubId: 'gh-3',
          githubLogin: 'new-gh',
          passwordHash: null,
        }),
      }),
    );
  });

  it('returns email_required when github email is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const state = service.createGithubAuthState('/wizard');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-4',
      username: 'missing-email',
      emails: [],
    });

    expect(resolved.type).toBe('email_required');
  });

  it('exchanges OAuth code once and rejects replay', async () => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { githubId?: string; id?: string } }) => {
      if (where.githubId) {
        return {
          id: 'user-5',
          email: 'user5@example.com',
          role: 'USER',
          githubId: 'gh-5',
          githubLogin: 'user5-gh',
        };
      }
      if (where.id) {
        return {
          id: 'user-5',
          email: 'user5@example.com',
          role: 'USER',
        };
      }
      return null;
    });

    const state = service.createGithubAuthState('/wizard');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-5',
      username: 'user5-gh',
      emails: [{ value: 'user5@example.com', verified: true }],
    });

    if (resolved.type !== 'exchange') {
      throw new Error('Expected exchange code');
    }

    const first = await service.exchangeOAuthCode({ code: resolved.exchangeCode });
    expect(first.accessToken).toBe('signed.jwt.token');

    await expect(
      service.exchangeOAuthCode({ code: resolved.exchangeCode }),
    ).rejects.toEqual(expect.objectContaining({ code: 'oauth_exchange_invalid' }));
  });

  it('rejects conflicting github identity when email is already linked elsewhere', async () => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { githubId?: string; email?: string } }) => {
      if (where.githubId) {
        return null;
      }
      if (where.email) {
        return {
          id: 'user-6',
          email: 'user6@example.com',
          role: 'USER',
          githubId: 'different-gh',
          githubLogin: 'different-login',
        };
      }
      return null;
    });

    const state = service.createGithubAuthState('/wizard');

    await expect(
      service.resolveGithubCallback(state, {
        id: 'gh-6',
        username: 'gh6-login',
        emails: [{ value: 'user6@example.com', verified: true }],
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'oauth_identity_conflict' }));
  });

  it('completes email ticket and links account by email', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-7',
        email: 'linkme@example.com',
        role: 'USER',
        githubId: null,
        githubLogin: null,
      });
    prisma.user.update.mockResolvedValue({
      id: 'user-7',
      email: 'linkme@example.com',
      role: 'USER',
      githubId: 'gh-7',
      githubLogin: 'gh7-login',
    });

    const state = service.createGithubAuthState('/wizard');
    const initial = await service.resolveGithubCallback(state, {
      id: 'gh-7',
      username: 'gh7-login',
      emails: [],
    });

    if (initial.type !== 'email_required') {
      throw new Error('Expected email_required');
    }

    const completed = await service.completeGithubEmail({
      ticket: initial.emailTicket,
      email: 'linkme@example.com',
    });

    expect(completed.exchangeCode).toBeTruthy();
    expect(completed.returnTo).toBe('/wizard');
  });

  it('throws conflict when completing email ticket with already-linked email', async () => {
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { githubId?: string; email?: string } }) => {
        if (where.githubId) {
          return null;
        }
        if (where.email === 'taken@example.com') {
          return {
            id: 'user-8',
            email: 'taken@example.com',
            role: 'USER',
            githubId: 'another-gh',
            githubLogin: 'another-login',
          };
        }
        return null;
      },
    );

    const state = service.createGithubAuthState('/wizard');
    const initial = await service.resolveGithubCallback(state, {
      id: 'gh-8',
      username: 'gh8-login',
      emails: [],
    });

    if (initial.type !== 'email_required') {
      throw new Error('Expected email_required');
    }

    await expect(
      service.completeGithubEmail({
        ticket: initial.emailTicket,
        email: 'taken@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('links github profile for authenticated user in link flow', async () => {
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; githubId?: string } }) => {
        if (where.id === 'user-link-1') {
          return {
            id: 'user-link-1',
            email: 'linker@example.com',
            role: 'USER',
            githubId: null,
            githubLogin: null,
          };
        }
        if (where.githubId === 'gh-link-1') {
          return null;
        }
        return null;
      },
    );
    prisma.user.update.mockResolvedValue({
      id: 'user-link-1',
      email: 'linker@example.com',
      role: 'USER',
      githubId: 'gh-link-1',
      githubLogin: 'link-user',
    });

    const state = service.createGithubLinkState('user-link-1', '/settings');
    const resolved = await service.resolveGithubCallback(state, {
      id: 'gh-link-1',
      username: 'link-user',
      emails: [],
    });

    expect(resolved).toEqual({
      type: 'linked',
      returnTo: '/settings',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-link-1' },
        data: { githubId: 'gh-link-1', githubLogin: 'link-user' },
      }),
    );
  });

  it('rejects link flow when github account is linked to another user', async () => {
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; githubId?: string } }) => {
        if (where.id === 'user-link-2') {
          return {
            id: 'user-link-2',
            email: 'owner@example.com',
            role: 'USER',
            githubId: null,
            githubLogin: null,
          };
        }
        if (where.githubId === 'gh-link-conflict') {
          return {
            id: 'different-user',
            email: 'other@example.com',
            role: 'USER',
            githubId: 'gh-link-conflict',
            githubLogin: 'other',
          };
        }
        return null;
      },
    );

    const state = service.createGithubLinkState('user-link-2', '/settings');

    await expect(
      service.resolveGithubCallback(state, {
        id: 'gh-link-conflict',
        username: 'new-login',
        emails: [],
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'oauth_identity_conflict' }));
  });

  it('returns exchange code for already linked googleId', async () => {
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { googleId?: string; id?: string } }) => {
        if (where.googleId) {
          return {
            id: 'user-google-1',
            email: 'google1@example.com',
            role: 'USER',
            googleId: 'google-1',
            googleEmail: 'old@example.com',
            emailVerifiedAt: null,
          };
        }
        if (where.id) {
          return {
            id: 'user-google-1',
            email: 'google1@example.com',
            role: 'USER',
          };
        }
        return null;
      },
    );
    prisma.user.update.mockResolvedValue({
      id: 'user-google-1',
      email: 'google1@example.com',
      role: 'USER',
      googleId: 'google-1',
      googleEmail: 'google1@example.com',
      emailVerifiedAt: new Date(),
    });

    const state = service.createGoogleAuthState('/wizard');
    const resolved = await service.resolveGoogleCallback(state, {
      id: 'google-1',
      displayName: 'Google One',
      emails: [{ value: 'google1@example.com', verified: true }],
    });

    expect(resolved.type).toBe('exchange');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-google-1' },
        data: expect.objectContaining({
          googleEmail: 'google1@example.com',
        }),
      }),
    );
  });

  it('links google profile for authenticated user in link flow', async () => {
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; googleId?: string } }) => {
        if (where.id === 'user-google-link') {
          return {
            id: 'user-google-link',
            email: 'owner@example.com',
            role: 'USER',
            googleId: null,
            googleEmail: null,
          };
        }
        if (where.googleId === 'google-link') {
          return null;
        }
        return null;
      },
    );
    prisma.user.update.mockResolvedValue({
      id: 'user-google-link',
      email: 'owner@example.com',
      role: 'USER',
      googleId: 'google-link',
      googleEmail: 'owner@example.com',
    });

    const state = service.createGoogleLinkState('user-google-link', '/settings');
    const resolved = await service.resolveGoogleCallback(state, {
      id: 'google-link',
      emails: [{ value: 'owner@example.com', verified: true }],
    });

    expect(resolved).toEqual({
      type: 'linked',
      returnTo: '/settings',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-google-link' },
        data: {
          googleId: 'google-link',
          googleEmail: 'owner@example.com',
        },
      }),
    );
  });

  it('throws OAuthFlowError for unknown exchange code', async () => {
    await expect(
      service.exchangeOAuthCode({ code: 'missing-code' }),
    ).rejects.toBeInstanceOf(OAuthFlowError);
  });

  it('does not resend verification email for already verified users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-verified',
      email: 'verified@example.com',
      emailVerifiedAt: new Date('2026-05-10T00:00:00.000Z'),
    });

    const result = await service.resendVerificationEmail('user-verified');
    expect(result).toEqual({
      sent: false,
      alreadyVerified: true,
    });
  });

  it('verifies email when token is valid', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-email-1',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.update.mockResolvedValue({});

    const result = await service.verifyEmailToken('raw-token');
    expect(result).toEqual({ success: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailVerificationTokenHash: expect.any(String),
        },
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-email-1' },
        data: expect.objectContaining({
          emailVerifiedAt: expect.any(Date),
          emailVerificationTokenHash: null,
          emailVerificationTokenExpiresAt: null,
        }),
      }),
    );
  });
});

