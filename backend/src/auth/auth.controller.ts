import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, OAuthFlowError } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OAuthExchangeDto } from './dto/oauth-exchange.dto.js';
import { OAuthCompleteEmailDto } from './dto/oauth-complete-email.dto.js';
import { Roles, RolesGuard } from './roles.guard.js';
import { GithubAuthGuard } from './github-auth.guard.js';
import { GithubLinkGuard } from './github-link.guard.js';
import { GithubCallbackGuard } from './github-callback.guard.js';

type GithubCallbackGuardPayload =
  | { type: 'ok'; data: unknown }
  | { type: 'error'; code: string };

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  me(@Req() req: Request & { user?: { id?: string } }) {
    return this.auth.getCurrentUser(req.user?.id ?? '');
  }

  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiExcludeEndpoint()
  githubAuth() {
    // Handled by Passport redirect.
  }

  @Get('github/link')
  @UseGuards(AuthGuard('jwt'), GithubLinkGuard)
  @ApiBearerAuth()
  @ApiExcludeEndpoint()
  githubLink() {
    // Handled by Passport redirect.
  }

  @Get('github/callback')
  @UseGuards(GithubCallbackGuard)
  @ApiExcludeEndpoint()
  githubCallback(@Req() req: Request, @Res() res: Response) {
    const flow = typeof req.query?.flow === 'string' ? req.query.flow : 'auth';
    const errorRoute = flow === 'link' ? '/settings' : '/oauth/github/callback';
    const payload = req.user as GithubCallbackGuardPayload;
    if (payload?.type === 'error') {
      return res.redirect(
        this.auth.buildFrontendOAuthRedirect(errorRoute, {
          error: payload.code,
        }),
      );
    }

    const data = payload?.data as
      | { type: 'exchange'; exchangeCode: string; returnTo: string }
      | { type: 'email_required'; emailTicket: string; returnTo: string }
      | { type: 'linked'; returnTo: string };

    if (!data || !data.type) {
      return res.redirect(
        this.auth.buildFrontendOAuthRedirect(errorRoute, {
          error: 'oauth_provider_failure',
        }),
      );
    }

    if (data.type === 'email_required') {
      return res.redirect(
        this.auth.buildFrontendOAuthRedirect('/oauth/github/complete-email', {
          ticket: data.emailTicket,
          returnTo: data.returnTo,
        }),
      );
    }

    if (data.type === 'linked') {
      return res.redirect(
        this.auth.buildFrontendOAuthRedirect('/settings', {
          githubLinked: '1',
          returnTo: data.returnTo,
        }),
      );
    }

    return res.redirect(
      this.auth.buildFrontendOAuthRedirect('/oauth/github/callback', {
        code: data.exchangeCode,
        returnTo: data.returnTo,
      }),
    );
  }

  @Post('oauth/exchange')
  async oauthExchange(@Body() dto: OAuthExchangeDto) {
    try {
      return await this.auth.exchangeOAuthCode(dto);
    } catch (error) {
      if (error instanceof OAuthFlowError) {
        throw new UnauthorizedException('OAuth code is invalid or expired');
      }
      throw error;
    }
  }

  @Post('oauth/complete-email')
  oauthCompleteEmail(@Body() dto: OAuthCompleteEmailDto) {
    return this.auth.completeGithubEmail(dto);
  }

  @Post('email/resend-verification')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  resendVerification(
    @Req() req: Request & { user?: { id?: string } },
  ) {
    return this.auth.resendVerificationEmail(req.user?.id ?? '');
  }

  @Get('verify-email')
  @ApiExcludeEndpoint()
  async verifyEmail(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.auth.verifyEmailToken(token);
    if (result.success) {
      return res.redirect(
        this.auth.buildFrontendOAuthRedirect('/settings', {
          emailVerified: '1',
        }),
      );
    }

    return res.redirect(
      this.auth.buildFrontendOAuthRedirect('/settings', {
        error: 'email_verify_invalid',
      }),
    );
  }
}

@Controller('admin/users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin Users')
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  listUsers() {
    return this.auth.listUsers();
  }
}
