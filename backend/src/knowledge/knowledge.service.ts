import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeQueryDto } from './dto/knowledge-query.dto.js';
import type { KnowledgeCategory } from './knowledge.types.js';

export interface KnowledgeArticleListItem {
  slug: string;
  title: string;
  country: string;
  category: KnowledgeCategory;
  language: string;
  excerpt: string;
  topicTags: string[];
  riskTags: string[];
  updatedAt: Date;
}

export interface KnowledgeArticleDetail {
  slug: string;
  title: string;
  country: string;
  category: KnowledgeCategory;
  language: string;
  content: string;
  topicTags: string[];
  riskTags: string[];
  updatedAt: Date;
}

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async listArticles(query: KnowledgeQueryDto) {
    const language = this.normalizeLanguage(query.language);
    const where: {
      language: string;
      country?: string;
      category?: KnowledgeCategory;
    } = { language };

    if (query.country) {
      where.country = this.normalizeCountry(query.country);
    }
    if (query.category) {
      where.category = query.category;
    }

    const rows = await (this.prisma as any).knowledgeArticle.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      select: {
        slug: true,
        title: true,
        country: true,
        category: true,
        language: true,
        content: true,
        topicTags: true,
        riskTags: true,
        updatedAt: true,
      },
    });

    const items: KnowledgeArticleListItem[] = rows.map((row: any) => ({
      slug: row.slug,
      title: row.title,
      country: row.country,
      category: row.category,
      language: row.language,
      excerpt: this.buildExcerpt(row.content),
      topicTags: Array.isArray(row.topicTags) ? row.topicTags : [],
      riskTags: Array.isArray(row.riskTags) ? row.riskTags : [],
      updatedAt: row.updatedAt,
    }));

    return {
      items,
      filters: {
        country: where.country ?? null,
        category: where.category ?? null,
        language,
      },
      total: items.length,
    };
  }

  async getArticleBySlug(slug: string, languageRaw?: string): Promise<KnowledgeArticleDetail> {
    const language = this.normalizeLanguage(languageRaw);
    const article = await (this.prisma as any).knowledgeArticle.findUnique({
      where: {
        slug_language: {
          slug,
          language,
        },
      },
      select: {
        slug: true,
        title: true,
        country: true,
        category: true,
        language: true,
        content: true,
        topicTags: true,
        riskTags: true,
        updatedAt: true,
      },
    });

    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }

    return {
      slug: article.slug,
      title: article.title,
      country: article.country,
      category: article.category,
      language: article.language,
      content: article.content,
      topicTags: Array.isArray(article.topicTags) ? article.topicTags : [],
      riskTags: Array.isArray(article.riskTags) ? article.riskTags : [],
      updatedAt: article.updatedAt,
    };
  }

  private normalizeLanguage(language?: string): string {
    const normalized = (language ?? 'en').trim().toLowerCase();
    return normalized || 'en';
  }

  private normalizeCountry(country: string): string {
    return country.trim().toUpperCase();
  }

  private buildExcerpt(content: string): string {
    const flattened = content.replace(/\r/g, '').replace(/\n+/g, ' ').trim();
    if (flattened.length <= 220) return flattened;
    return `${flattened.slice(0, 217).trimEnd()}...`;
  }
}
