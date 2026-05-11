import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { KnowledgeQueryDto } from './dto/knowledge-query.dto.js';
import { KnowledgeService } from './knowledge.service.js';

@Controller('knowledge')
@ApiTags('Knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  listArticles(@Query() query: KnowledgeQueryDto, @Req() req: any) {
    return this.knowledgeService.listArticles(query, this.extractUserId(req));
  }

  @Get(':slug')
  getArticle(
    @Param('slug') slug: string,
    @Query('language') language?: string,
    @Req() req?: any,
  ) {
    return this.knowledgeService.getArticleBySlug(
      slug,
      language,
      this.extractUserId(req),
    );
  }

  private extractUserId(req?: any): string | undefined {
    const authHeader = String(req?.headers?.authorization ?? '');
    if (!authHeader.startsWith('Bearer ')) return undefined;
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return undefined;

    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      }) as { sub?: string };
      return typeof payload?.sub === 'string' ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}
