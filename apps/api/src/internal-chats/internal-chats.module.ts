import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InternalChatsController } from './internal-chats.controller.js';
import { InternalChatsService } from './internal-chats.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [InternalChatsController],
  providers: [InternalChatsService],
})
export class InternalChatsModule {}
