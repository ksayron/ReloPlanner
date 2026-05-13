import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Req() req: Request & { user?: { id?: string } },
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.notificationsService.listMyNotifications(
      req.user?.id ?? '',
      limit,
    );
  }

  @Post(':notificationId/read')
  markRead(
    @Req() req: Request & { user?: { id?: string } },
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markRead(
      req.user?.id ?? '',
      notificationId,
    );
  }

  @Post('read-all')
  markAllRead(@Req() req: Request & { user?: { id?: string } }) {
    return this.notificationsService.markAllRead(req.user?.id ?? '');
  }
}
