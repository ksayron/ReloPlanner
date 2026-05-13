import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TARGET_CITY_BY_COUNTRY,
  TARGET_COUNTRIES,
} from '../countries/countries.data.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

const SUPPORTED_LANGUAGES = new Set(['en', 'ru']);
const SUPPORTED_THEMES = new Set(['light', 'dark']);
const SUPPORTED_CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'PLN',
  'UAH',
]);
const TARGET_COUNTRY_CODES = new Set(
  TARGET_COUNTRIES.map((country) => country.code),
);

const DEFAULT_PREFERENCES = {
  preferredLanguage: 'en',
  preferredTheme: 'light',
  preferredCurrency: 'USD',
  defaultTargetCountry: null as string | null,
  defaultTargetCity: null as string | null,
  weeklyStudyHours: 8,
  preferredReportLanguage: 'en',
};

type PreferenceRecord = {
  userId: string;
  preferredLanguage: string;
  preferredTheme: string;
  preferredCurrency: string;
  defaultTargetCountry: string | null;
  defaultTargetCity: string | null;
  weeklyStudyHours: number;
  preferredReportLanguage: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyPreferences(userId: string) {
    const record = await this.ensurePreferenceRecord(userId);
    return this.toResponse(record);
  }

  async updateMyPreferences(userId: string, dto: UpdatePreferencesDto) {
    const current = await this.ensurePreferenceRecord(userId);
    const patch = this.buildPatch(dto);

    const countryWasPatched = Object.prototype.hasOwnProperty.call(
      patch,
      'defaultTargetCountry',
    );
    const cityWasPatched = Object.prototype.hasOwnProperty.call(
      patch,
      'defaultTargetCity',
    );
    const mergedCountry = countryWasPatched
      ? (patch.defaultTargetCountry as string | null)
      : current.defaultTargetCountry;
    const mergedCity = cityWasPatched
      ? (patch.defaultTargetCity as string | null)
      : current.defaultTargetCity;
    this.validateLocationPair(mergedCountry ?? null, mergedCity ?? null);

    const updated = (await (this.prisma as any).userPreference.update({
      where: { userId },
      data: patch,
    })) as PreferenceRecord;

    return this.toResponse(updated);
  }

  private async ensurePreferenceRecord(
    userId: string,
  ): Promise<PreferenceRecord> {
    if (!userId) {
      throw new UnauthorizedException('User not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return (await (this.prisma as any).userPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        ...DEFAULT_PREFERENCES,
      },
    })) as PreferenceRecord;
  }

  private buildPatch(dto: UpdatePreferencesDto): Record<string, unknown> {
    const patch: Record<string, unknown> = {};

    if (dto.preferredLanguage !== undefined) {
      const value = this.normalizeLanguage(dto.preferredLanguage);
      if (!SUPPORTED_LANGUAGES.has(value)) {
        throw new BadRequestException(
          'preferredLanguage must be one of: en, ru',
        );
      }
      patch.preferredLanguage = value;
    }

    if (dto.preferredTheme !== undefined) {
      const value = dto.preferredTheme.trim().toLowerCase();
      if (!SUPPORTED_THEMES.has(value)) {
        throw new BadRequestException(
          'preferredTheme must be one of: light, dark',
        );
      }
      patch.preferredTheme = value;
    }

    if (dto.preferredCurrency !== undefined) {
      const value = dto.preferredCurrency.trim().toUpperCase();
      if (!SUPPORTED_CURRENCIES.has(value)) {
        throw new BadRequestException(
          'preferredCurrency must be one of: USD, EUR, GBP, CAD, PLN, UAH',
        );
      }
      patch.preferredCurrency = value;
    }

    if (dto.preferredReportLanguage !== undefined) {
      const value = this.normalizeLanguage(dto.preferredReportLanguage);
      if (!SUPPORTED_LANGUAGES.has(value)) {
        throw new BadRequestException(
          'preferredReportLanguage must be one of: en, ru',
        );
      }
      patch.preferredReportLanguage = value;
    }

    if (dto.defaultTargetCountry !== undefined) {
      if (dto.defaultTargetCountry === null) {
        patch.defaultTargetCountry = null;
      } else {
        const value = dto.defaultTargetCountry.trim().toUpperCase();
        if (!value) {
          patch.defaultTargetCountry = null;
        } else if (!TARGET_COUNTRY_CODES.has(value)) {
          throw new BadRequestException(
            'defaultTargetCountry must be a supported target country',
          );
        } else {
          patch.defaultTargetCountry = value;
        }
      }
    }

    if (dto.defaultTargetCity !== undefined) {
      if (dto.defaultTargetCity === null) {
        patch.defaultTargetCity = null;
      } else {
        const value = dto.defaultTargetCity.trim();
        if (!value) {
          throw new BadRequestException(
            'defaultTargetCity must be non-empty when provided',
          );
        }
        patch.defaultTargetCity = value;
      }
    }

    if (dto.weeklyStudyHours !== undefined) {
      if (
        !Number.isInteger(dto.weeklyStudyHours) ||
        dto.weeklyStudyHours < 1 ||
        dto.weeklyStudyHours > 40
      ) {
        throw new BadRequestException(
          'weeklyStudyHours must be an integer between 1 and 40',
        );
      }
      patch.weeklyStudyHours = dto.weeklyStudyHours;
    }

    return patch;
  }

  private validateLocationPair(country: string | null, city: string | null) {
    if (city && !country) {
      throw new BadRequestException(
        'defaultTargetCity requires defaultTargetCountry to be set',
      );
    }

    if (!country || !city) {
      return;
    }

    const suggestedCity = TARGET_CITY_BY_COUNTRY[country];
    if (suggestedCity && suggestedCity.toLowerCase() === city.toLowerCase()) {
      return;
    }
    // Custom city values are allowed as long as they are non-empty strings.
  }

  private normalizeLanguage(value: string): string {
    return value.trim().toLowerCase();
  }

  private toResponse(record: PreferenceRecord) {
    return {
      preferredLanguage: record.preferredLanguage,
      preferredTheme: record.preferredTheme,
      preferredCurrency: record.preferredCurrency,
      defaultTargetCountry: record.defaultTargetCountry,
      defaultTargetCity: record.defaultTargetCity,
      weeklyStudyHours: record.weeklyStudyHours,
      preferredReportLanguage: record.preferredReportLanguage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
