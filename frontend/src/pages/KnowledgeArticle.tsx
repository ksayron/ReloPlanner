import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { fetchKnowledgeArticle } from '../api/knowledge';
import type { KnowledgeArticleDetail } from '../types';

export default function KnowledgeArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const language = (searchParams.get('language') ?? 'en').toLowerCase();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetchKnowledgeArticle(slug, language);
        setArticle(response);
      } catch {
        setError('Knowledge article not found or unavailable.');
      } finally {
        setLoading(false);
      }
    })();
  }, [language, slug]);

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader color="brand.7" />
      </Group>
    );
  }

  return (
    <Stack gap="lg">
      <Button component={RouterLink} to="/knowledge" variant="subtle" color="brand.7" w="fit-content">
        Back to Knowledge Base
      </Button>

      {error && <Alert color="red">{error}</Alert>}

      {!error && article && (
        <Card withBorder radius="md" p="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Title order={2}>{article.title}</Title>
              <Group gap="xs">
                <Badge color="brand.1" variant="light">
                  {article.country}
                </Badge>
                <Badge color="brand.7" variant="outline">
                  {article.category}
                </Badge>
              </Group>
            </Group>

            <Group gap="xs">
              {article.topicTags.map((tag) => (
                <Badge key={tag} variant="dot" color="gray">
                  {tag}
                </Badge>
              ))}
            </Group>

            <Text size="sm" c="dimmed">
              Updated: {new Date(article.updatedAt).toLocaleString()}
            </Text>

            <div className="space-y-3 leading-7 text-slate-800">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {article.content}
              </ReactMarkdown>
            </div>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
