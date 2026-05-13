import { useCallback, useEffect, useState } from 'react';
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
import { startPremiumCheckout } from '../api/billing';
import { fetchMyPreferences } from '../api/preferences';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type { KnowledgeArticleDetail } from '../types';

export default function KnowledgeArticle() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upgradeOpened, setUpgradeOpened] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'ru'>('en');

  const urlLanguage = searchParams.get('language');
  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');
  const language = (urlLanguage ?? preferredLanguage).toLowerCase();

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (urlLanguage) return;
    void (async () => {
      const preferences = await fetchMyPreferences();
      if (preferences?.preferredLanguage === 'ru') {
        setPreferredLanguage('ru');
      }
    })();
  }, [urlLanguage]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetchKnowledgeArticle(slug, language);
        setArticle(response);
      } catch (err: any) {
        if (err?.response?.data?.code === 'UPGRADE_REQUIRED') {
          setError('This article is locked on Free plan.');
        } else {
          setError('Knowledge article not found or unavailable.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [language, slug]);

  useEffect(() => {
    if (!checkoutAction || !checkoutSessionId) return;

    let canceled = false;
    setCheckoutProcessing(true);
    setUpgradeError('');

    void (async () => {
      try {
        const resolved = await pollCheckoutStatus(checkoutSessionId);
        if (canceled) return;

        if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
          setUpgradeOpened(false);
          setLoading(true);
          const response = await fetchKnowledgeArticle(slug ?? '', language);
          setArticle(response);
          setError('');
        } else if (resolved.paymentStatus === 'CANCELED' || checkoutAction === 'cancel') {
          setUpgradeError('Checkout was canceled before completion.');
        } else if (resolved.paymentStatus === 'PENDING') {
          setUpgradeError(
            'Checkout is still pending webhook confirmation. Refresh shortly if status does not update.',
          );
        } else {
          setUpgradeError(
            resolved.errorMessage ?? 'Checkout failed. Please retry with Stripe test card details.',
          );
        }
      } catch (err: any) {
        if (canceled) return;
        setUpgradeError(String(err?.response?.data?.message ?? 'Failed to resolve checkout status.'));
      } finally {
        if (canceled) return;
        setLoading(false);
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, language, slug]);

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

      {error && (
        <Alert color="red">
          {error}
          {error.includes('locked') ? (
            <Group mt="xs">
              <Button
                size="xs"
                color="brand.7"
                onClick={() => {
                  setUpgradeError('');
                  setUpgradeOpened(true);
                }}
              >
                Upgrade
              </Button>
            </Group>
          ) : null}
        </Alert>
      )}
      {checkoutProcessing ? (
        <Alert color="blue">Processing Stripe checkout status...</Alert>
      ) : null}

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

      <PremiumUpgradeModal
        opened={upgradeOpened}
        onClose={() => setUpgradeOpened(false)}
        onUpgrade={async () => {
          setUpgradeLoading(true);
          setUpgradeError('');
          try {
            const urls = buildCheckoutReturnUrls(window.location.pathname, searchParams);
            const checkout = await startPremiumCheckout(urls);
            if (!checkout.checkoutUrl) {
              throw new Error('Checkout URL was not returned by billing provider.');
            }
            window.location.assign(checkout.checkoutUrl);
          } catch (err: any) {
            setUpgradeError(String(err?.response?.data?.message ?? 'Upgrade failed'));
          } finally {
            setUpgradeLoading(false);
          }
        }}
        loading={upgradeLoading}
        featureName="Premium knowledge base articles"
        errorMessage={upgradeError || null}
      />
    </Stack>
  );
}
