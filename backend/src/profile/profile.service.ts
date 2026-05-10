import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUser(userId: string) {
    return this.prisma.relocationProfile.findMany({
      where: { userId },
    });
  }

  async findOne(id: string, userId: string) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id, userId },
      include: {
        competencies: {
          include: { competency: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async create(userId: string, dto: CreateProfileDto) {
    const { competencies, ...profileData } = dto;

    return this.prisma.$transaction(async (tx: any) => {
      const profile = await tx.relocationProfile.create({
        data: {
          ...profileData,
          userId,
        },
      });

      if (competencies.length > 0) {
        await tx.userCompetency.createMany({
          data: competencies.map((c) => ({
            profileId: profile.id,
            competencyId: c.competencyId,
            hardSkillLevel: c.hardSkillLevel ?? null,
            languageLevel: c.languageLevel ?? null,
            certificationStatus: c.certificationStatus ?? null,
          })),
        });
      }

      return profile;
    });
  }

  async update(id: string, userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.relocationProfile.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Profile not found');
    }

    const { competencies, ...profileData } = dto;
    const data = Object.fromEntries(
      Object.entries(profileData).filter(([, value]) => value !== undefined),
    );

    return this.prisma.$transaction(async (tx: any) => {
      const profile = await tx.relocationProfile.update({
        where: { id },
        data,
      });

      if (Array.isArray(competencies)) {
        await tx.userCompetency.deleteMany({ where: { profileId: id } });

        if (competencies.length > 0) {
          await tx.userCompetency.createMany({
            data: competencies.map((c) => ({
              profileId: id,
              competencyId: c.competencyId,
              hardSkillLevel: c.hardSkillLevel ?? null,
              languageLevel: c.languageLevel ?? null,
              certificationStatus: c.certificationStatus ?? null,
            })),
          });
        }
      }

      return profile;
    });
  }
}
