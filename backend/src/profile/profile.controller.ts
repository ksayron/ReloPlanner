import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Profiles')
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.profileService.findAllByUser(req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateProfileDto) {
    return this.profileService.create(req.user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.profileService.findOne(id, req.user.id);
  }
}
