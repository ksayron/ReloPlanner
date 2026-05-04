import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ColService } from './col.service.js';
import { ColController } from './col.controller.js';
import { WhereNextService } from './wherenext.service.js';
import { ColSyncService } from './col-sync.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [ColController],
  providers: [ColService, WhereNextService, ColSyncService],
  exports: [ColService, WhereNextService],
})
export class ColModule {}
