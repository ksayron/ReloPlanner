import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthFlowError, type OAuthErrorCode } from './auth.service.js';

type GoogleCallbackGuardResult =
  | {
      type: 'ok';
      data: unknown;
    }
  | {
      type: 'error';
      code: OAuthErrorCode;
    };

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  getAuthenticateOptions(_context: ExecutionContext) {
    return { session: false };
  }

  handleRequest<TUser = any>(
    err: unknown,
    user: unknown,
    _info: unknown,
    _context?: ExecutionContext,
  ): TUser {
    if (err instanceof OAuthFlowError) {
      return { type: 'error', code: err.code } as TUser;
    }

    if (err || !user) {
      return { type: 'error', code: 'oauth_provider_failure' } as TUser;
    }

    return { type: 'ok', data: user } as TUser;
  }
}
