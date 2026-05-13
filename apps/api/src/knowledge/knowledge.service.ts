import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { KnowledgeQueryDto } from './dto/knowledge-query.dto.js';
import { BillingService } from '../billing/billing.service.js';
import type {
  KnowledgeAccessLevel,
  KnowledgeCategory,
} from './knowledge.types.js';

export interface KnowledgeArticleListItem {
  slug: string;
  title: string;
  country: string;
  category: KnowledgeCategory;
  accessLevel: KnowledgeAccessLevel;
  isLocked: boolean;
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
  accessLevel: KnowledgeAccessLevel;
  isLocked: boolean;
  language: string;
  content: string;
  topicTags: string[];
  riskTags: string[];
  updatedAt: Date;
}

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async listArticles(query: KnowledgeQueryDto, userId?: string) {
    const language = this.normalizeLanguage(query.language);
    const planCode = await this.resolvePlanCode(userId);
    const isPremiumUser = planCode === 'PREMIUM';
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
        accessLevel: true,
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
      accessLevel: row.accessLevel,
      isLocked: row.accessLevel === 'PREMIUM' && !isPremiumUser,
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
      access: {
        planCode,
      },
    };
  }

  async getArticleBySlug(
    slug: string,
    languageRaw?: string,
    userId?: string,
  ): Promise<KnowledgeArticleDetail> {
    const language = this.normalizeLanguage(languageRaw);
    const planCode = await this.resolvePlanCode(userId);
    const isPremiumUser = planCode === 'PREMIUM';
    const select = {
      slug: true,
      title: true,
      country: true,
      category: true,
      accessLevel: true,
      language: true,
      content: true,
      topicTags: true,
      riskTags: true,
      updatedAt: true,
    };
    let article = await (this.prisma as any).knowledgeArticle.findUnique({
      where: {
        slug_language: {
          slug,
          language,
        },
      },
      select,
    });

    if (!article && language !== 'en') {
      article = await (this.prisma as any).knowledgeArticle.findUnique({
        where: {
          slug_language: {
            slug,
            language: 'en',
          },
        },
        select,
      });
    }

    if (!article) {
      throw new NotFoundException('Knowledge article not found');
    }
    const isLocked = article.accessLevel === 'PREMIUM' && !isPremiumUser;
    if (isLocked) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        message: 'This knowledge article is available on PREMIUM plan.',
        featureCode: 'FULL_KNOWLEDGE_BASE',
        requiredPlan: 'PREMIUM',
        currentPlan: planCode,
      });
    }

    return {
      slug: article.slug,
      title: article.title,
      country: article.country,
      category: article.category,
      accessLevel: article.accessLevel,
      isLocked,
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

  private async resolvePlanCode(userId?: string): Promise<'FREE' | 'PREMIUM'> {
    if (!userId) return 'FREE';
    try {
      const subscription =
        await this.billingService.getCurrentSubscriptionForUser(userId);
      return subscription.plan.code === 'PREMIUM' ? 'PREMIUM' : 'FREE';
    } catch {
      return 'FREE';
    }
  }
}
