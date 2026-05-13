import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { CasesService } from './cases.service.js';
import { CreateCaseDto } from './dto/create-case.dto.js';
import { AssignSpecialistDto } from './dto/assign-specialist.dto.js';
import { PostCaseMessageDto } from './dto/post-case-message.dto.js';
import { UpdateReadStateDto } from './dto/update-read-state.dto.js';

type RequestUser = { id: string; role: Role; email?: string };

@Controller('cases')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Cases')
@ApiBearerAuth()
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  createCase(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: CreateCaseDto,
  ) {
    return this.casesService.createCase(req.user, dto);
  }

  @Get()
  listCases(@Req() req: Request & { user: RequestUser }) {
    return this.casesService.listCases(req.user);
  }

  @Get(':caseId')
  getCase(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.getCase(req.user, caseId);
  }

  @Post(':caseId/submit')
  submitCase(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.submitCase(req.user, caseId);
  }

  @Post(':caseId/archive')
  archiveCase(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.archiveCase(req.user, caseId);
  }

  @Post(':caseId/cancel')
  cancelCase(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.cancelCase(req.user, caseId);
  }

  @Post(':caseId/assign-self')
  assignCaseToSelf(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.assignToSelf(req.user, caseId);
  }

  @Get(':caseId/messages')
  listMessages(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.listMessages(req.user, caseId);
  }

  @Post(':caseId/messages')
  postMessage(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
    @Body() dto: PostCaseMessageDto,
  ) {
    return this.casesService.postMessage(req.user, caseId, dto);
  }

  @Get(':caseId/read-state')
  getReadState(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
  ) {
    return this.casesService.getReadState(req.user, caseId);
  }

  @Post(':caseId/read-state')
  updateReadState(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
    @Body() dto: UpdateReadStateDto,
  ) {
    return this.casesService.updateReadState(req.user, caseId, dto);
  }
}

@Controller('admin/cases')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin Cases')
@ApiBearerAuth()
export class AdminCasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post(':caseId/assign')
  assignSpecialist(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
    @Body() dto: AssignSpecialistDto,
  ) {
    return this.casesService.assignSpecialist(
      req.user,
      caseId,
      dto.specialistUserId,
    );
  }

  @Post(':caseId/reassign')
  reassignSpecialist(
    @Req() req: Request & { user: RequestUser },
    @Param('caseId') caseId: string,
    @Body() dto: AssignSpecialistDto,
  ) {
    return this.casesService.reassignSpecialist(
      req.user,
      caseId,
      dto.specialistUserId,
    );
  }
}
