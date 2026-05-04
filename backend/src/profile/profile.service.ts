import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';

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
        skills: {
          include: { skill: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async create(userId: string, dto: CreateProfileDto) {
    const { skills, ...profileData } = dto;

    return this.prisma.$transaction(async (tx: any) => {
      const profile = await tx.relocationProfile.create({
        data: {
          ...profileData,
          userId,
        },
      });

      if (skills.length > 0) {
        await tx.userSkill.createMany({
          data: skills.map((s) => ({
            profileId: profile.id,
            skillId: s.skillId,
            proficiency: s.proficiency,
          })),
        });
      }

      return profile;
    });
  }
}
