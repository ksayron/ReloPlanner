import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

@Injectable()
export class GithubLinkGuard extends AuthGuard('github') {
  constructor(private readonly auth: AuthService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    if (!this.auth.isGithubOAuthEnabled()) {
      throw new UnauthorizedException(
        'GitHub OAuth is not configured on this server',
      );
    }

    const req = context.switchToHttp().getRequest<
      Request & { user?: { id?: string } }
    >();
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required');
    }
    const returnTo =
      typeof req.query?.returnTo === 'string' ? req.query.returnTo : '/settings';

    return {
      session: false,
      state: this.auth.createGithubLinkState(userId, returnTo),
      callbackURL: this.auth.getGithubCallbackUrl('link'),
      scope: ['user:email'],
    };
  }
}
