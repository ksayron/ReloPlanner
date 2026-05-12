import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

jest.mock('@nestjs/passport', () => ({
  AuthGuard:
    () =>
    class MockJwtGuard {
      canActivate(context: any) {
        const req = context.switchToHttp().getRequest();
        const auth = String(req.headers.authorization ?? '');
        if (!auth.startsWith('Bearer ')) {
          throw new UnauthorizedException('Missing bearer token');
        }
        req.user = { id: 'user-1' };
        return true;
      }
    },
}));

describe('PreferencesController', () => {
  let app: NestExpressApplication;
  const service = {
    getMyPreferences: jest.fn(),
    updateMyPreferences: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [{ provide: PreferencesService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service.getMyPreferences.mockResolvedValue({
      preferredLanguage: 'en',
      preferredTheme: 'light',
      preferredCurrency: 'USD',
      defaultTargetCountry: null,
      defaultTargetCity: null,
      weeklyStudyHours: 8,
      preferredReportLanguage: 'en',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    service.updateMyPreferences.mockResolvedValue({
      preferredLanguage: 'ru',
      preferredTheme: 'dark',
      preferredCurrency: 'EUR',
      defaultTargetCountry: 'DE',
      defaultTargetCity: 'Berlin',
      weeklyStudyHours: 10,
      preferredReportLanguage: 'ru',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('blocks requests without bearer token', async () => {
    await request(app.getHttpServer()).get('/preferences/me').expect(401);
  });

  it('returns current preferences for authenticated request', async () => {
    const response = await request(app.getHttpServer())
      .get('/preferences/me')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(service.getMyPreferences).toHaveBeenCalledWith('user-1');
    expect(response.body.preferredLanguage).toBe('en');
  });

  it('rejects invalid payload by validation rules', async () => {
    await request(app.getHttpServer())
      .patch('/preferences/me')
      .set('Authorization', 'Bearer token')
      .send({ weeklyStudyHours: 0 })
      .expect(400);
  });

  it('updates preferences for valid payload', async () => {
    const response = await request(app.getHttpServer())
      .patch('/preferences/me')
      .set('Authorization', 'Bearer token')
      .send({
        preferredLanguage: 'ru',
        preferredTheme: 'dark',
        preferredCurrency: 'EUR',
        weeklyStudyHours: 10,
      })
      .expect(200);

    expect(service.updateMyPreferences).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        preferredLanguage: 'ru',
        preferredTheme: 'dark',
        preferredCurrency: 'EUR',
        weeklyStudyHours: 10,
      }),
    );
    expect(response.body.preferredTheme).toBe('dark');
  });
});
