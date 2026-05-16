import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { fetchKnowledgeArticle } from '../api/knowledge';
import { startPremiumCheckout } from '../api/billing';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type { KnowledgeArticleDetail } from '../types';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

export default function KnowledgeArticle() {
  const { t } = useTranslation('knowledge');
  const { language: appLanguage } = useAppLanguage();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [article, setArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upgradeOpened, setUpgradeOpened] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);

  const urlLanguage = searchParams.get('language');
  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');
  const language = useMemo(
    () => ((urlLanguage ?? appLanguage).toLowerCase() === 'ru' ? 'ru' : 'en'),
    [appLanguage, urlLanguage],
  );

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
          setError(t('articleLocked'));
        } else {
          setError(t('articleMissing'));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [language, slug, t]);

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
          setUpgradeError(t('checkoutCanceled'));
        } else if (resolved.paymentStatus === 'PENDING') {
          setUpgradeError(t('checkoutPending'));
        } else {
          setUpgradeError(
            resolved.errorMessage ?? t('checkoutFailed'),
          );
        }
      } catch (err: any) {
        if (canceled) return;
        setUpgradeError(String(err?.response?.data?.message ?? t('resolveCheckoutFailed')));
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
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, language, slug, t]);

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
        {t('backToKnowledge')}
      </Button>

      {error && (
        <Alert color="red">
          {error}
          {error.includes(t('articleLocked')) ? (
            <Group mt="xs">
              <Button
                size="xs"
                color="brand.7"
                onClick={() => {
                  setUpgradeError('');
                  setUpgradeOpened(true);
                }}
              >
                {t('upgrade')}
              </Button>
            </Group>
          ) : null}
        </Alert>
      )}
      {checkoutProcessing ? (
        <Alert color="blue">{t('processingCheckout')}</Alert>
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
              Updated: {new Date(article.updatedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}
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
              throw new Error(t('checkoutMissingUrl'));
            }
            window.location.assign(checkout.checkoutUrl);
          } catch (err: any) {
            setUpgradeError(String(err?.response?.data?.message ?? t('upgradeFailed')));
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
