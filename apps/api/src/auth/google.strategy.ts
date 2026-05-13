import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import type { Request } from 'express';
import { AuthService, OAuthFlowError } from './auth.service.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly oauthEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    const configuredClientId =
      config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '';
    const configuredClientSecret =
      config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
    const clientId = configuredClientId || 'disabled-client-id';
    const clientSecret = configuredClientSecret || 'disabled-client-secret';

    super({
      clientID: clientId,
      clientSecret,
      callbackURL: auth.getGoogleCallbackUrl('auth'),
      scope: ['profile', 'email'],
      passReqToCallback: true,
    });

    this.oauthEnabled = Boolean(
      configuredClientId.trim() && configuredClientSecret.trim(),
    );
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      displayName?: string;
      emails?: Array<{
        value?: string | null;
        verified?: boolean;
        primary?: boolean;
      }>;
    },
  ) {
    if (!this.oauthEnabled) {
      throw new OAuthFlowError('oauth_provider_failure');
    }

    const state =
      typeof req.query?.state === 'string' ? req.query.state : undefined;

    return this.auth.resolveGoogleCallback(state, profile);
  }
}
