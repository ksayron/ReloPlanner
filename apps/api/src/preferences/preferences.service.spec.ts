import { BadRequestException } from '@nestjs/common';
import { PreferencesService } from './preferences.service.js';

describe('PreferencesService', () => {
  const userId = 'user-1';
  const defaultRow = {
    userId,
    preferredLanguage: 'en',
    preferredTheme: 'light',
    preferredCurrency: 'USD',
    defaultTargetCountry: null,
    defaultTargetCity: null,
    weeklyStudyHours: 8,
    preferredReportLanguage: 'en',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  function makeService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: userId }),
      },
      userPreference: {
        upsert: jest.fn().mockResolvedValue(defaultRow),
        update: jest.fn().mockResolvedValue(defaultRow),
      },
    };
    const service = new PreferencesService(prisma as any);
    return { service, prisma };
  }

  it('returns default preferences from persisted record', async () => {
    const { service, prisma } = makeService();

    const result = await service.getMyPreferences(userId);

    expect(prisma.userPreference.upsert).toHaveBeenCalled();
    expect(result).toMatchObject({
      preferredLanguage: 'en',
      preferredTheme: 'light',
      preferredCurrency: 'USD',
      defaultTargetCountry: null,
      defaultTargetCity: null,
      weeklyStudyHours: 8,
      preferredReportLanguage: 'en',
    });
  });

  it('rejects unsupported language', async () => {
    const { service } = makeService();

    await expect(
      service.updateMyPreferences(userId, { preferredLanguage: 'de' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects city without country', async () => {
    const { service } = makeService();

    await expect(
      service.updateMyPreferences(userId, { defaultTargetCity: 'Berlin' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates partial preferences with validation', async () => {
    const { service, prisma } = makeService();
    prisma.userPreference.update.mockResolvedValue({
      ...defaultRow,
      preferredReportLanguage: 'ru',
      defaultTargetCountry: 'DE',
      defaultTargetCity: 'Berlin',
      weeklyStudyHours: 12,
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const result = await service.updateMyPreferences(userId, {
      preferredReportLanguage: 'ru',
      defaultTargetCountry: 'de',
      defaultTargetCity: 'Berlin',
      weeklyStudyHours: 12,
    });

    expect(prisma.userPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
      }),
    );
    expect(result).toMatchObject({
      preferredReportLanguage: 'ru',
      defaultTargetCountry: 'DE',
      defaultTargetCity: 'Berlin',
      weeklyStudyHours: 12,
    });
  });
});
