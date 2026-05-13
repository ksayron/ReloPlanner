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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { InternalChatsService } from './internal-chats.service.js';
import { StartDirectChatDto } from './dto/start-direct-chat.dto.js';
import { PostDirectChatMessageDto } from './dto/post-direct-chat-message.dto.js';
import type { Role } from '@reloplanner/shared-contracts';

type RequestUser = { id: string; role: Role };

@Controller('internal/chats')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Internal Chats')
@ApiBearerAuth()
export class InternalChatsController {
  constructor(private readonly chats: InternalChatsService) {}

  @Get('clients')
  listClients(@Req() req: Request & { user: RequestUser }) {
    return this.chats.listClients(req.user);
  }

  @Get()
  listThreads(@Req() req: Request & { user: RequestUser }) {
    return this.chats.listThreads(req.user);
  }

  @Post('start')
  startThread(
    @Req() req: Request & { user: RequestUser },
    @Body() dto: StartDirectChatDto,
  ) {
    return this.chats.startThread(req.user, dto);
  }

  @Get(':threadId/messages')
  listMessages(
    @Req() req: Request & { user: RequestUser },
    @Param('threadId') threadId: string,
  ) {
    return this.chats.listMessages(req.user, threadId);
  }

  @Post(':threadId/messages')
  postMessage(
    @Req() req: Request & { user: RequestUser },
    @Param('threadId') threadId: string,
    @Body() dto: PostDirectChatMessageDto,
  ) {
    return this.chats.postMessage(req.user, threadId, dto);
  }
}
