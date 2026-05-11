import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PreferencesService } from './preferences.service.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';

@Controller('preferences')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Preferences')
@ApiBearerAuth()
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get('me')
  getMyPreferences(@Req() req: Request & { user?: { id?: string } }) {
    return this.preferencesService.getMyPreferences(req.user?.id ?? '');
  }

  @Patch('me')
  updateMyPreferences(
    @Req() req: Request & { user?: { id?: string } },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.preferencesService.updateMyPreferences(req.user?.id ?? '', dto);
  }
}
