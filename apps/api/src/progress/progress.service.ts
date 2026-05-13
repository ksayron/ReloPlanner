import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateGapStatusDto } from './dto/update-gap-status.dto.js';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(gapId: string, userId: string, dto: UpdateGapStatusDto) {
    const gap = await this.prisma.roadmapStep.findUnique({
      where: { id: gapId },
      include: {
        analysis: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!gap) {
      throw new NotFoundException(`RoadmapStep with id ${gapId} not found`);
    }

    if (gap.analysis.profile.userId !== userId) {
      throw new ForbiddenException('You do not own this gap item');
    }

    const updated = await this.prisma.roadmapStep.update({
      where: { id: gapId },
      data: { status: dto.status },
    });

    return updated;
  }
}
