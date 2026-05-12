import { KnowledgeController } from '../knowledge.controller';
import { KnowledgeService } from '../knowledge.service';

describe('KnowledgeController', () => {
  const listArticles = jest.fn();
  const getArticleBySlug = jest.fn();
  const service: Partial<KnowledgeService> = {
    listArticles,
    getArticleBySlug,
  };
  const controller = new KnowledgeController(service as KnowledgeService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes list filters to service', async () => {
    listArticles.mockResolvedValue({ items: [], filters: {}, total: 0 });

    await controller.listArticles({ country: 'PL', language: 'en' });

    expect(listArticles).toHaveBeenCalledWith({
      country: 'PL',
      language: 'en',
    });
  });

  it('passes slug and language to detail service', async () => {
    getArticleBySlug.mockResolvedValue({ slug: 'abc', content: 'x' });

    await controller.getArticle('abc', 'en');

    expect(getArticleBySlug).toHaveBeenCalledWith('abc', 'en');
  });
});
