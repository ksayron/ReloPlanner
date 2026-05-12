import client from './client';
import type {
  KnowledgeArticleDetail,
  KnowledgeCategory,
  KnowledgeListResponse,
} from '../types';

export type KnowledgeListParams = {
  country?: string;
  category?: KnowledgeCategory;
  language?: string;
};

export async function fetchKnowledgeList(
  params: KnowledgeListParams = {},
): Promise<KnowledgeListResponse> {
  const res = await client.get<KnowledgeListResponse>('/knowledge', { params });
  return res.data;
}

export async function fetchKnowledgeArticle(
  slug: string,
  language = 'en',
): Promise<KnowledgeArticleDetail> {
  const res = await client.get<KnowledgeArticleDetail>(`/knowledge/${slug}`, {
    params: { language },
  });
  return res.data;
}
