import { BadRequestException } from '@nestjs/common';
import { IMarketDataAdapter, MarketDataRow } from './market-data.adapter.js';

export class ManualAdapter implements IMarketDataAdapter {
  parse(raw: any): MarketDataRow[] {
    if (!Array.isArray(raw)) {
      throw new BadRequestException('Expected an array of skill rows');
    }

    return raw.map((item, index) => {
      if (
        typeof item.skillName !== 'string' ||
        !item.skillName.trim()
      ) {
        throw new BadRequestException(
          `Row ${index}: skillName must be a non-empty string`,
        );
      }

      if (typeof item.frequency !== 'number' || item.frequency < 0) {
        throw new BadRequestException(
          `Row ${index}: frequency must be a non-negative number`,
        );
      }

      if (
        typeof item.avgRequiredLevel !== 'number' ||
        item.avgRequiredLevel < 0
      ) {
        throw new BadRequestException(
          `Row ${index}: avgRequiredLevel must be a non-negative number`,
        );
      }

      return {
        skillName: item.skillName.trim(),
        frequency: item.frequency,
        avgRequiredLevel: item.avgRequiredLevel,
      };
    });
  }
}
