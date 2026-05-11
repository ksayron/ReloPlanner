import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto.js';
import { OAuthCompleteEmailDto } from './dto/oauth-complete-email.dto.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_EXCHANGE_TTL_MS = 2 * 60 * 1000;
const OAUTH_EMAIL_TICKET_TTL_MS = 10 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const SMTP_CONNECTION_TIMEOUT_MS = 5000;
const SMTP_GREETING_TIMEOUT_MS = 5000;
const SMTP_SOCKET_TIMEOUT_MS = 10000;

type OAuthStateRecord = {
  returnTo: string;
  mode: 'auth' | 'link';
  userId?: string;
  expiresAt: number;
};

type OAuthExchangeRecord = {
  userId: string;
  expiresAt: number;
};

type OAuthEmailTicketRecord = {
  githubId: string;
  githubLogin: string | null;
  returnTo: string;
  expiresAt: number;
};

export type OAuthErrorCode =
  | 'oauth_invalid_state'
  | 'oauth_provider_failure'
  | 'oauth_exchange_invalid'
  | 'oauth_email_required'
  | 'oauth_identity_conflict'
  | 'oauth_email_mismatch';

export class OAuthFlowError extends Error {
  constructor(public readonly code: OAuthErrorCode) {
    super(code);
    this.name = 'OAuthFlowError';
  }
}

export type GithubProfileEmail = {
  value?: string | null;
  verified?: boolean;
  primary?: boolean;
};

export type GithubProfileLike = {
  id: string;
  username?: string;
  displayName?: string;
  emails?: GithubProfileEmail[];
};

export type GoogleProfileLike = {
  id: string;
  displayName?: string;
  emails?: GithubProfileEmail[];
};

export type GithubCallbackResolution =
  | {
      type: 'exchange';
      exchangeCode: string;
      returnTo: string;
    }
  | {
      type: 'email_required';
      emailTicket: string;
      returnTo: string;
    }
  | {
      type: 'linked';
      returnTo: string;
    };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauthStates = new Map<string, OAuthStateRecord>();
  private readonly oauthExchanges = new Map<string, OAuthExchangeRecord>();
  private readonly oauthEmailTickets = new Map<string, OAuthEmailTicketRecord>();
  private readonly frontendBaseUrl: string;
  private readonly backendBaseUrl: string;
  private readonly githubOauthEnabled: boolean;
  private readonly googleOauthEnabled: boolean;
  private readonly githubCallbackUrl: string;
  private readonly googleCallbackUrl: string;
  private readonly smtpFrom: string | null;
  private readonly mailTransporter: Transporter | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const githubClientId = this.config.get<string>('GITHUB_OAUTH_CLIENT_ID') ?? '';
    const githubClientSecret =
      this.config.get<string>('GITHUB_OAUTH_CLIENT_SECRET') ?? '';
    const googleClientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '';
    const googleClientSecret =
      this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
    this.frontendBaseUrl = (
      this.config.get<string>('FRONTEND_BASE_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, '');
    this.backendBaseUrl = (
      this.config.get<string>('BACKEND_BASE_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.githubCallbackUrl =
      this.config.get<string>('GITHUB_OAUTH_CALLBACK_URL') ??
      'http://localhost:3000/api/auth/github/callback';
    this.googleCallbackUrl =
      this.config.get<string>('GOOGLE_OAUTH_CALLBACK_URL') ??
      'http://localhost:3000/api/auth/google/callback';
    this.githubOauthEnabled = Boolean(
      githubClientId.trim() && githubClientSecret.trim(),
    );
    this.googleOauthEnabled = Boolean(
      googleClientId.trim() && googleClientSecret.trim(),
    );

    const smtpHost = (this.config.get<string>('SMTP_HOST') ?? '').trim();
    const smtpPortRaw = (this.config.get<string>('SMTP_PORT') ?? '587').trim();
    const smtpSecureRaw = (this.config.get<string>('SMTP_SECURE') ?? 'false')
      .trim()
      .toLowerCase();
    const smtpUser = (this.config.get<string>('SMTP_USER') ?? '').trim();
    const smtpPass = (this.config.get<string>('SMTP_PASS') ?? '').trim();
    const smtpFrom = (this.config.get<string>('SMTP_FROM') ?? '').trim();
    const smtpPort = Number.parseInt(smtpPortRaw, 10);

    this.smtpFrom = smtpFrom.length > 0 ? smtpFrom : null;
    if (smtpHost && this.smtpFrom) {
      this.mailTransporter = createTransport({
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecureRaw === 'true',
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        auth:
          smtpUser && smtpPass
            ? {
                user: smtpUser,
                pass: smtpPass,
              }
            : undefined,
      });
    } else {
      this.mailTransporter = null;
      this.logger.warn(
        'SMTP is not configured. Email verification links will not be sent.',
      );
    }
  }

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { email, passwordHash: hash },
    });

    await this.issueEmailVerification(user.id, user.email, {
      waitForSend: false,
    });

    const token = this.signToken(user.id, user.role, user.email);

    return { accessToken: token };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.signToken(user.id, user.role, user.email);

    return { accessToken: token };
  }

  createGithubAuthState(returnTo: string | undefined) {
    this.cleanupOAuthStores();
    const state = this.generateToken();
    this.oauthStates.set(state, {
      returnTo: this.sanitizeReturnTo(returnTo),
      mode: 'auth',
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  createGithubLinkState(userId: string, returnTo: string | undefined) {
    this.cleanupOAuthStores();
    const state = this.generateToken();
    this.oauthStates.set(state, {
      returnTo: this.sanitizeReturnTo(returnTo ?? '/settings'),
      mode: 'link',
      userId,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  createGoogleAuthState(returnTo: string | undefined) {
    this.cleanupOAuthStores();
    const state = this.generateToken();
    this.oauthStates.set(state, {
      returnTo: this.sanitizeReturnTo(returnTo),
      mode: 'auth',
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  createGoogleLinkState(userId: string, returnTo: string | undefined) {
    this.cleanupOAuthStores();
    const state = this.generateToken();
    this.oauthStates.set(state, {
      returnTo: this.sanitizeReturnTo(returnTo ?? '/settings'),
      mode: 'link',
      userId,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  isGithubOAuthEnabled() {
    return this.githubOauthEnabled;
  }

  isGoogleOAuthEnabled() {
    return this.googleOauthEnabled;
  }

  getGithubCallbackUrl(flow: 'auth' | 'link') {
    const url = new URL(this.githubCallbackUrl);
    if (flow === 'link') {
      url.searchParams.set('flow', 'link');
    } else {
      url.searchParams.delete('flow');
    }
    return url.toString();
  }

  getGoogleCallbackUrl(flow: 'auth' | 'link') {
    const url = new URL(this.googleCallbackUrl);
    if (flow === 'link') {
      url.searchParams.set('flow', 'link');
    } else {
      url.searchParams.delete('flow');
    }
    return url.toString();
  }

  async resolveGithubCallback(
    state: string | undefined,
    profile: GithubProfileLike,
  ): Promise<GithubCallbackResolution> {
    this.cleanupOAuthStores();
    const stateRecord = this.consumeOAuthState(state);

    if (!stateRecord) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const returnTo = stateRecord.returnTo;
    const githubId = String(profile.id ?? '').trim();
    if (!githubId) {
      throw new OAuthFlowError('oauth_provider_failure');
    }

    const githubLogin = this.normalizeGithubLogin(
      profile.username ?? profile.displayName ?? null,
    );

    if (stateRecord.mode === 'link') {
      return this.resolveGithubLinkCallback(
        stateRecord.userId,
        returnTo,
        githubId,
        githubLogin,
      );
    }

    const providerEmail = this.pickProviderEmail(profile.emails);

    const byGithubId = await this.prisma.user.findUnique({
      where: { githubId },
    });

    if (byGithubId) {
      const updateData: {
        githubLogin?: string | null;
        emailVerifiedAt?: Date;
      } = {};
      if (githubLogin && byGithubId.githubLogin !== githubLogin) {
        updateData.githubLogin = githubLogin;
      }
      if (providerEmail?.verified && !byGithubId.emailVerifiedAt) {
        updateData.emailVerifiedAt = new Date();
      }
      if (Object.keys(updateData).length > 0) {
        await this.prisma.user.update({
          where: { id: byGithubId.id },
          data: updateData,
        });
      }

      return {
        type: 'exchange',
        exchangeCode: this.createOAuthExchangeCode(byGithubId.id),
        returnTo,
      };
    }

    if (!providerEmail) {
      const emailTicket = this.generateToken();
      this.oauthEmailTickets.set(emailTicket, {
        githubId,
        githubLogin,
        returnTo,
        expiresAt: Date.now() + OAUTH_EMAIL_TICKET_TTL_MS,
      });
      return {
        type: 'email_required',
        emailTicket,
        returnTo,
      };
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: providerEmail.email },
    });

    if (byEmail) {
      if (byEmail.githubId && byEmail.githubId !== githubId) {
        throw new OAuthFlowError('oauth_identity_conflict');
      }
      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          githubId,
          githubLogin,
          emailVerifiedAt:
            providerEmail.verified && !byEmail.emailVerifiedAt
              ? new Date()
              : byEmail.emailVerifiedAt,
        },
      });

      return {
        type: 'exchange',
        exchangeCode: this.createOAuthExchangeCode(linked.id),
        returnTo,
      };
    }

    const created = await this.prisma.user.create({
      data: {
        email: providerEmail.email,
        passwordHash: null,
        githubId,
        githubLogin,
        emailVerifiedAt: providerEmail.verified ? new Date() : null,
      },
    });

    return {
      type: 'exchange',
      exchangeCode: this.createOAuthExchangeCode(created.id),
      returnTo,
    };
  }

  async resolveGoogleCallback(
    state: string | undefined,
    profile: GoogleProfileLike,
  ): Promise<GithubCallbackResolution> {
    this.cleanupOAuthStores();
    const stateRecord = this.consumeOAuthState(state);

    if (!stateRecord) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const returnTo = stateRecord.returnTo;
    const googleId = String(profile.id ?? '').trim();
    if (!googleId) {
      throw new OAuthFlowError('oauth_provider_failure');
    }

    const providerEmail = this.pickProviderEmail(profile.emails);
    if (!providerEmail) {
      throw new OAuthFlowError('oauth_provider_failure');
    }

    if (stateRecord.mode === 'link') {
      return this.resolveGoogleLinkCallback(
        stateRecord.userId,
        returnTo,
        googleId,
        providerEmail.email,
      );
    }

    const byGoogleId = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (byGoogleId) {
      const updateData: {
        googleEmail?: string;
        emailVerifiedAt?: Date;
      } = {};
      if (byGoogleId.googleEmail !== providerEmail.email) {
        updateData.googleEmail = providerEmail.email;
      }
      if (providerEmail.verified && !byGoogleId.emailVerifiedAt) {
        updateData.emailVerifiedAt = new Date();
      }
      if (Object.keys(updateData).length > 0) {
        await this.prisma.user.update({
          where: { id: byGoogleId.id },
          data: updateData,
        });
      }

      return {
        type: 'exchange',
        exchangeCode: this.createOAuthExchangeCode(byGoogleId.id),
        returnTo,
      };
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: providerEmail.email },
    });

    if (byEmail) {
      if (byEmail.googleId && byEmail.googleId !== googleId) {
        throw new OAuthFlowError('oauth_identity_conflict');
      }
      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId,
          googleEmail: providerEmail.email,
          emailVerifiedAt:
            providerEmail.verified && !byEmail.emailVerifiedAt
              ? new Date()
              : byEmail.emailVerifiedAt,
        },
      });

      return {
        type: 'exchange',
        exchangeCode: this.createOAuthExchangeCode(linked.id),
        returnTo,
      };
    }

    const created = await this.prisma.user.create({
      data: {
        email: providerEmail.email,
        passwordHash: null,
        googleId,
        googleEmail: providerEmail.email,
        emailVerifiedAt: providerEmail.verified ? new Date() : null,
      },
    });

    return {
      type: 'exchange',
      exchangeCode: this.createOAuthExchangeCode(created.id),
      returnTo,
    };
  }

  private async resolveGithubLinkCallback(
    userId: string | undefined,
    returnTo: string,
    githubId: string,
    githubLogin: string | null,
  ): Promise<GithubCallbackResolution> {
    if (!userId) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const linkedUser = await this.prisma.user.findUnique({
      where: { githubId },
    });

    if (linkedUser && linkedUser.id !== currentUser.id) {
      throw new OAuthFlowError('oauth_identity_conflict');
    }

    if (currentUser.githubId && currentUser.githubId !== githubId) {
      throw new OAuthFlowError('oauth_identity_conflict');
    }

    await this.prisma.user.update({
      where: { id: currentUser.id },
      data: { githubId, githubLogin },
    });

    return {
      type: 'linked',
      returnTo,
    };
  }

  private async resolveGoogleLinkCallback(
    userId: string | undefined,
    returnTo: string,
    googleId: string,
    googleEmail: string,
  ): Promise<GithubCallbackResolution> {
    if (!userId) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new OAuthFlowError('oauth_invalid_state');
    }

    const linkedUser = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (linkedUser && linkedUser.id !== currentUser.id) {
      throw new OAuthFlowError('oauth_identity_conflict');
    }

    if (currentUser.googleId && currentUser.googleId !== googleId) {
      throw new OAuthFlowError('oauth_identity_conflict');
    }

    if (currentUser.email.trim().toLowerCase() !== googleEmail) {
      throw new OAuthFlowError('oauth_email_mismatch');
    }

    await this.prisma.user.update({
      where: { id: currentUser.id },
      data: {
        googleId,
        googleEmail,
      },
    });

    return {
      type: 'linked',
      returnTo,
    };
  }

  async completeGithubEmail(dto: OAuthCompleteEmailDto) {
    this.cleanupOAuthStores();
    const ticket = this.oauthEmailTickets.get(dto.ticket);

    if (!ticket || ticket.expiresAt < Date.now()) {
      if (ticket) {
        this.oauthEmailTickets.delete(dto.ticket);
      }
      throw new BadRequestException('OAuth email ticket is invalid or expired');
    }

    this.oauthEmailTickets.delete(dto.ticket);

    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const byGithubId = await this.prisma.user.findUnique({
      where: { githubId: ticket.githubId },
    });

    if (byGithubId) {
      return {
        exchangeCode: this.createOAuthExchangeCode(byGithubId.id),
        returnTo: ticket.returnTo,
      };
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email },
    });

    if (byEmail) {
      if (byEmail.githubId && byEmail.githubId !== ticket.githubId) {
        throw new ConflictException(
          'This email is already linked to another GitHub account',
        );
      }
      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          githubId: ticket.githubId,
          githubLogin: ticket.githubLogin,
        },
      });

      return {
        exchangeCode: this.createOAuthExchangeCode(linked.id),
        returnTo: ticket.returnTo,
      };
    }

    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash: null,
        githubId: ticket.githubId,
        githubLogin: ticket.githubLogin,
      },
    });

    return {
      exchangeCode: this.createOAuthExchangeCode(created.id),
      returnTo: ticket.returnTo,
    };
  }

  async exchangeOAuthCode(dto: OAuthExchangeDto) {
    this.cleanupOAuthStores();
    const exchange = this.oauthExchanges.get(dto.code);
    this.oauthExchanges.delete(dto.code);

    if (!exchange || exchange.expiresAt < Date.now()) {
      throw new OAuthFlowError('oauth_exchange_invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: exchange.userId },
    });

    if (!user) {
      throw new OAuthFlowError('oauth_exchange_invalid');
    }

    return {
      accessToken: this.signToken(user.id, user.role, user.email),
    };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerifiedAt) {
      return {
        sent: false,
        alreadyVerified: true,
      };
    }

    const sent = await this.issueEmailVerification(user.id, user.email);
    return {
      sent,
      alreadyVerified: false,
    };
  }

  async unlinkGithub(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        githubId: null,
        githubLogin: null,
      },
    });

    return { unlinked: true };
  }

  async unlinkGoogle(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: null,
        googleEmail: null,
      },
    });

    return { unlinked: true };
  }

  async verifyEmailToken(token: string | undefined) {
    const value = token?.trim();
    if (!value) {
      return { success: false };
    }

    const hash = this.hashToken(value);
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: hash,
      },
      select: {
        id: true,
        emailVerificationTokenExpiresAt: true,
      },
    });

    if (!user) {
      return { success: false };
    }

    if (
      !user.emailVerificationTokenExpiresAt ||
      user.emailVerificationTokenExpiresAt.getTime() < Date.now()
    ) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationTokenHash: null,
          emailVerificationTokenExpiresAt: null,
        },
      });
      return { success: false };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
    return { success: true };
  }

  buildFrontendOAuthRedirect(
    route:
      | '/oauth/github/callback'
      | '/oauth/google/callback'
      | '/oauth/github/complete-email'
      | '/settings',
    params: Record<string, string | undefined>,
  ) {
    const url = new URL(route, `${this.frontendBaseUrl}/`);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        query.set(key, value);
      }
    }
    url.search = query.toString();
    return url.toString();
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        githubId: true,
        githubLogin: true,
        googleId: true,
        googleEmail: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      githubLinked: Boolean(user.githubId),
      githubLogin: user.githubLogin,
      googleLinked: Boolean(user.googleId),
      googleEmail: user.googleEmail,
      emailVerified: Boolean(user.emailVerifiedAt),
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        githubId: true,
        githubLogin: true,
        googleId: true,
        googleEmail: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  private async issueEmailVerification(
    userId: string,
    email: string,
    options?: { waitForSend?: boolean },
  ) {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: expiresAt,
      },
    });

    if (options?.waitForSend === false) {
      void this.sendVerificationEmail(email, token);
      return false;
    }

    return this.sendVerificationEmail(email, token);
  }

  private async sendVerificationEmail(email: string, token: string) {
    if (!this.mailTransporter || !this.smtpFrom) {
      return false;
    }

    const link = `${this.backendBaseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your email for ReloPlanner';
    const text = `Welcome to ReloPlanner.\n\nPlease verify your email by opening this link:\n${link}\n\nIf you did not create this account, ignore this email.`;
    const html = `<p>Welcome to ReloPlanner.</p><p>Please verify your email by opening this link:</p><p><a href="${link}">${link}</a></p><p>If you did not create this account, ignore this email.</p>`;

    try {
      await this.mailTransporter.sendMail({
        from: this.smtpFrom,
        to: email,
        subject,
        text,
        html,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  private signToken(userId: string, role: string, email: string) {
    return this.jwt.sign({ sub: userId, role, email });
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private sanitizeReturnTo(value: string | undefined) {
    if (!value) {
      return '/wizard';
    }
    if (!value.startsWith('/')) {
      return '/wizard';
    }
    if (value.startsWith('//')) {
      return '/wizard';
    }
    return value;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizeGithubLogin(value: string | null) {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private pickProviderEmail(emails: GithubProfileEmail[] | undefined) {
    if (!emails || emails.length === 0) {
      return null;
    }
    const preferred =
      emails.find((entry) => entry.primary) ??
      emails.find((entry) => entry.verified) ??
      emails[0];
    const value = preferred?.value ? preferred.value.trim().toLowerCase() : '';
    if (value.length === 0) {
      return null;
    }
    return {
      email: value,
      verified: Boolean(preferred?.verified),
    };
  }

  private createOAuthExchangeCode(userId: string) {
    const code = this.generateToken();
    this.oauthExchanges.set(code, {
      userId,
      expiresAt: Date.now() + OAUTH_EXCHANGE_TTL_MS,
    });
    return code;
  }

  private consumeOAuthState(state: string | undefined) {
    if (!state) {
      return null;
    }
    const record = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    if (!record || record.expiresAt < Date.now()) {
      return null;
    }
    return record;
  }

  private cleanupOAuthStores() {
    const now = Date.now();
    this.cleanupExpiredMap(this.oauthStates, now);
    this.cleanupExpiredMap(this.oauthExchanges, now);
    this.cleanupExpiredMap(this.oauthEmailTickets, now);
  }

  private cleanupExpiredMap<T extends { expiresAt: number }>(
    store: Map<string, T>,
    now: number,
  ) {
    for (const [key, value] of store.entries()) {
      if (value.expiresAt < now) {
        store.delete(key);
      }
    }
  }

  private generateToken() {
    return randomBytes(32).toString('base64url');
  }
}
