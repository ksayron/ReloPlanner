import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import {
  AdminCasesController,
  CasesController,
  InternalCasesController,
} from './cases.controller.js';
import { CasesService } from './cases.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule, RealtimeModule],
  controllers: [CasesController, AdminCasesController, InternalCasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
