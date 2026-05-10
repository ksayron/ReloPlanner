import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KnowledgeQueryDto } from './dto/knowledge-query.dto.js';
import { KnowledgeService } from './knowledge.service.js';

@Controller('knowledge')
@ApiTags('Knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  listArticles(@Query() query: KnowledgeQueryDto) {
    return this.knowledgeService.listArticles(query);
  }

  @Get(':slug')
  getArticle(@Param('slug') slug: string, @Query('language') language?: string) {
    return this.knowledgeService.getArticleBySlug(slug, language);
  }
}
