import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Role } from '@prisma/client';
import { TaxonomyService } from './taxonomy.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CreateTransferabilityDto } from './dto/create-transferability.dto';

@Controller('admin/taxonomy')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  findAll() {
    return this.taxonomyService.findAll();
  }

  @Post('skills')
  create(@Body() dto: CreateSkillDto) {
    return this.taxonomyService.create(dto);
  }

  @Put('skills/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.taxonomyService.update(id, dto);
  }

  @Post('transferability')
  upsertTransferability(@Body() dto: CreateTransferabilityDto) {
    return this.taxonomyService.upsertTransferability(dto);
  }
}

@Controller('skills')
@UseGuards(AuthGuard('jwt'))
export class SkillsController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get()
  findAll() {
    return this.taxonomyService.findAll();
  }

  @Post('skills')
  create(@Body() dto: CreateSkillDto) {
    return this.taxonomyService.create(dto);
  }

  @Put('skills/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.taxonomyService.update(id, dto);
  }

  @Post('transferability')
  upsertTransferability(@Body() dto: CreateTransferabilityDto) {
    return this.taxonomyService.upsertTransferability(dto);
  }
}
