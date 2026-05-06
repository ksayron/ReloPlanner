import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service.js';
import { UpdateGapStatusDto } from './dto/update-gap-status.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('gaps')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Progress')
@ApiBearerAuth()
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateGapStatusDto,
    @Req() req: any,
  ) {
    return this.progressService.updateStatus(id, req.user.id, dto);
  }
}
