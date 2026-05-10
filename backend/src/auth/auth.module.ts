import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AdminUsersController, AuthController } from './auth.controller.js';
import { JwtStrategy } from './jwt.strategy.js';
import { GithubStrategy } from './github.strategy.js';
import { GithubAuthGuard } from './github-auth.guard.js';
import { GithubLinkGuard } from './github-link.guard.js';
import { GithubCallbackGuard } from './github-callback.guard.js';
import { GoogleStrategy } from './google.strategy.js';
import { GoogleAuthGuard } from './google-auth.guard.js';
import { GoogleLinkGuard } from './google-link.guard.js';
import { GoogleCallbackGuard } from './google-callback.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    GithubStrategy,
    GithubAuthGuard,
    GithubLinkGuard,
    GithubCallbackGuard,
    GoogleStrategy,
    GoogleAuthGuard,
    GoogleLinkGuard,
    GoogleCallbackGuard,
    RolesGuard,
  ],
  controllers: [AuthController, AdminUsersController],
  exports: [RolesGuard],
})
export class AuthModule {}
