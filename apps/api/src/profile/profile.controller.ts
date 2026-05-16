import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CompareProfilesDto } from './dto/compare-profiles.dto';
import { ProfileComparisonService } from './profile-comparison.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Profiles')
@ApiBearerAuth()
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly comparisonService: ProfileComparisonService,
  ) {}

  @Get()
  findAll(@Request() req: any) {
    return this.profileService.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateProfileDto) {
    return this.profileService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.update(id, req.user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.profileService.findOne(id, req.user.id);
  }

  @Post('compare')
  compare(@Request() req: any, @Body() dto: CompareProfilesDto) {
    return this.comparisonService.compareProfiles(
      req.user.id,
      dto.firstProfileId,
      dto.secondProfileId,
    );
  }
}
