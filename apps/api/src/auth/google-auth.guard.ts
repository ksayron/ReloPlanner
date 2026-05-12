import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly auth: AuthService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    if (!this.auth.isGoogleOAuthEnabled()) {
      throw new UnauthorizedException(
        'Google OAuth is not configured on this server',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const returnTo =
      typeof req.query?.returnTo === 'string' ? req.query.returnTo : undefined;

    return {
      session: false,
      state: this.auth.createGoogleAuthState(returnTo),
      callbackURL: this.auth.getGoogleCallbackUrl('auth'),
      scope: ['profile', 'email'],
    };
  }
}
