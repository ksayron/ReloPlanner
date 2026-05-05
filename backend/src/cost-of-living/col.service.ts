import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ColService {
  constructor(private readonly prisma: PrismaService) {}

  async listCities() {
    const rows = await this.prisma.costOfLivingData.findMany({
      distinct: ['city'],
      select: { city: true },
      orderBy: { city: 'asc' },
    });

    return rows.map((r) => r.city);
  }

  async compare(city1: string, city2: string) {
    const [data1, data2] = await Promise.all([
      this.prisma.costOfLivingData.findMany({ where: { city: city1 } }),
      this.prisma.costOfLivingData.findMany({ where: { city: city2 } }),
    ]);

    if (data1.length === 0) {
      throw new NotFoundException(`No cost-of-living data found for city: ${city1}`);
    }
    if (data2.length === 0) {
      throw new NotFoundException(`No cost-of-living data found for city: ${city2}`);
    }

    const city1Map = new Map(data1.map((d: any) => [d.category, d.avgMonthlyUsd]));
    const city2Map = new Map(data2.map((d: any) => [d.category, d.avgMonthlyUsd]));

    const allCategories = new Set([...city1Map.keys(), ...city2Map.keys()]);

    const comparison = Array.from(allCategories).map((category) => ({
      category,
      city1Amount: city1Map.get(category) ?? null,
      city2Amount: city2Map.get(category) ?? null,
    }));

    return {
      city1,
      city2,
      comparison,
    };
  }
}
