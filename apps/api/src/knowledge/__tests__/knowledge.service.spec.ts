import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from '../knowledge.service';

describe('KnowledgeService', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    knowledgeArticle: {
      findMany,
      findUnique,
    },
  };

  let service: KnowledgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KnowledgeService(prisma as any);
  });

  it('uses default language=en for list query', async () => {
    findMany.mockResolvedValue([]);

    const result = await service.listArticles({});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { language: 'en' },
      }),
    );
    expect(result.total).toBe(0);
    expect(result.filters.language).toBe('en');
  });

  it('applies normalized country/category/language filters and deterministic ordering', async () => {
    findMany.mockResolvedValue([]);

    await service.listArticles({
      country: 'pl',
      category: 'VISA',
      language: 'EN',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          country: 'PL',
          category: 'VISA',
          language: 'en',
        },
        orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      }),
    );
  });

  it('returns list items with excerpt and without full content body', async () => {
    findMany.mockResolvedValue([
      {
        slug: 'demo',
        title: 'Demo',
        country: 'DE',
        category: 'LEGAL',
        language: 'en',
        content: 'x'.repeat(300),
        topicTags: ['legal'],
        riskTags: ['completeness'],
        updatedAt: new Date('2026-05-10T00:00:00Z'),
      },
    ]);

    const result = await service.listArticles({ language: 'en' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].excerpt.endsWith('...')).toBe(true);
    expect(result.items[0].excerpt.length).toBeLessThanOrEqual(220);
    expect((result.items[0] as any).content).toBeUndefined();
  });

  it('loads detail by composite slug/language and defaults language=en', async () => {
    findUnique.mockResolvedValue({
      slug: 'de-visa-checklist-it-specialists',
      title: 'Germany Visa Checklist for IT Specialists',
      country: 'DE',
      category: 'VISA',
      language: 'en',
      content: '# content',
      topicTags: ['visa'],
      riskTags: ['legal'],
      updatedAt: new Date('2026-05-10T00:00:00Z'),
    });

    const result = await service.getArticleBySlug(
      'de-visa-checklist-it-specialists',
    );

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug_language: {
            slug: 'de-visa-checklist-it-specialists',
            language: 'en',
          },
        },
      }),
    );
    expect(result.content).toBe('# content');
  });

  it('throws not found when article slug/language does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.getArticleBySlug('missing', 'en'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
