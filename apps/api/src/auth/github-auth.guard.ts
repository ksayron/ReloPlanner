import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  constructor(private readonly auth: AuthService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    if (!this.auth.isGithubOAuthEnabled()) {
      throw new UnauthorizedException(
        'GitHub OAuth is not configured on this server',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const returnTo =
      typeof req.query?.returnTo === 'string' ? req.query.returnTo : undefined;

    return {
      session: false,
      state: this.auth.createGithubAuthState(returnTo),
      callbackURL: this.auth.getGithubCallbackUrl('auth'),
      scope: ['user:email'],
    };
  }
}
