import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { fetchKnowledgeList } from '../api/knowledge';
import { getBillingStatus, startPremiumCheckout } from '../api/billing';
import { fetchMyPreferences } from '../api/preferences';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import { buildCheckoutReturnUrls, pollCheckoutStatus } from '../utils/checkout';
import type { KnowledgeArticleListItem, KnowledgeCategory } from '../types';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

export default function KnowledgeList() {
  const { t } = useTranslation('knowledge');
  const { language } = useAppLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<KnowledgeArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPlanCode, setCurrentPlanCode] = useState<'FREE' | 'PREMIUM'>('FREE');
  const [upgradeOpened, setUpgradeOpened] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [defaultCountry, setDefaultCountry] = useState('');
  const [preferencesResolved, setPreferencesResolved] = useState(false);

  const categoryOptions: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: '', label: t('allCategories') },
      { value: 'VISA', label: t('visa') },
      { value: 'LEGAL', label: t('legal') },
      { value: 'COST', label: t('cost') },
      { value: 'JOB', label: t('job') },
      { value: 'CV', label: t('cv') },
      { value: 'LANGUAGE', label: t('languageCategory') },
      { value: 'HOUSING', label: t('housing') },
    ],
    [t],
  );

  const countryOptions: Array<{ value: string; label: string }> = useMemo(
    () => [
      { value: '', label: t('allCountries') },
      { value: 'PL', label: 'Poland' },
      { value: 'NL', label: 'Netherlands' },
      { value: 'DE', label: 'Germany' },
      { value: 'GB', label: 'United Kingdom' },
      { value: 'CA', label: 'Canada' },
    ],
    [t],
  );

  const selectedCountry = searchParams.get('country') ?? '';
  const selectedCategory = searchParams.get('category') ?? '';
  const checkoutAction = searchParams.get('checkout');
  const checkoutSessionId = searchParams.get('session_id');

  const clearCheckoutParams = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const query = useMemo(() => {
    const next: { country?: string; category?: KnowledgeCategory; language: string } = {
      language,
    };
    if (selectedCountry) next.country = selectedCountry;
    if (selectedCategory) next.category = selectedCategory as KnowledgeCategory;
    return next;
  }, [language, selectedCategory, selectedCountry]);

  useEffect(() => {
    void (async () => {
      const preferences = await fetchMyPreferences();
      setDefaultCountry(preferences?.defaultTargetCountry ?? '');
      setPreferencesResolved(true);
    })();
  }, []);

  useEffect(() => {
    if (!preferencesResolved) return;
    if (!defaultCountry) return;
    if (selectedCountry) return;
    const next = new URLSearchParams(searchParams);
    next.set('country', defaultCountry);
    setSearchParams(next);
  }, [
    defaultCountry,
    preferencesResolved,
    searchParams,
    selectedCountry,
    setSearchParams,
  ]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetchKnowledgeList(query);
        setItems(response.items);
        setCurrentPlanCode(response.access?.planCode ?? 'FREE');
      } catch {
        setError(t('failedLoadList'));
      } finally {
        setLoading(false);
      }
    })();
  }, [query, t]);

  const triggerUpgrade = async () => {
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
  };

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
          const status = await getBillingStatus();
          setCurrentPlanCode(status.plan.code);
          const refreshed = await fetchKnowledgeList(query);
          setItems(refreshed.items);
          setUpgradeOpened(false);
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
        setCheckoutProcessing(false);
        clearCheckoutParams();
      }
    })();

    return () => {
      canceled = true;
    };
  }, [checkoutAction, checkoutSessionId, clearCheckoutParams, query, t]);

  const onCountryChange = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('country', value);
    else next.delete('country');
    setSearchParams(next);
  };

  const onCategoryChange = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('category', value);
    else next.delete('category');
    setSearchParams(next);
  };

  return (
    <Stack gap="lg">
      <Title order={2}>{t('title')}</Title>
      <Text c="dimmed">{t('subtitle')}</Text>
      <Group gap="xs">
        <Badge color={currentPlanCode === 'PREMIUM' ? 'teal' : 'gray'} variant="light">
          {t('plan')}: {currentPlanCode === 'PREMIUM' ? t('premium') : t('free')}
        </Badge>
        <Badge color="grape" variant="light">
          {t('premiumArticlesAvailable')}
        </Badge>
      </Group>

      <Group grow>
        <Select
          label={t('country')}
          data={countryOptions}
          value={selectedCountry}
          onChange={onCountryChange}
        />
        <Select
          label={t('category')}
          data={categoryOptions}
          value={selectedCategory}
          onChange={onCategoryChange}
        />
      </Group>

      {error && <Alert color="red">{error}</Alert>}
      {checkoutProcessing ? (
        <Alert color="blue">{t('processingCheckout')}</Alert>
      ) : null}
      {loading && (
        <Group justify="center" py="xl">
          <Loader color="brand.7" />
        </Group>
      )}

      {!loading && !error && items.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">{t('noArticles')}</Text>
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {items.map((article) => (
            <Card key={`${article.slug}:${article.language}`} withBorder radius="md" p="lg">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Title order={4}>{article.title}</Title>
                  <Badge color="brand.1" variant="light">
                    {article.country}
                  </Badge>
                </Group>
                <Group gap="xs">
                  <Badge size="sm" variant="outline" color="brand.7">
                    {article.category}
                  </Badge>
                  {article.accessLevel === 'PREMIUM' ? (
                    <Badge size="sm" variant="light" color="grape">
                      {t('premium')}
                    </Badge>
                  ) : null}
                  {article.topicTags.slice(0, 2).map((tag) => (
                    <Badge key={tag} size="sm" variant="dot" color="gray">
                      {tag}
                    </Badge>
                  ))}
                </Group>
                <Text size="sm" c="dimmed">
                  {article.excerpt}
                </Text>
                {article.isLocked ? (
                  <Button
                    variant="outline"
                    color="grape"
                    w="fit-content"
                    onClick={() => {
                      setUpgradeError('');
                      setUpgradeOpened(true);
                    }}
                  >
                    {t('unlockWithPremium')}
                  </Button>
                ) : (
                  <Button
                    component={RouterLink}
                    to={`/knowledge/${article.slug}?language=${article.language}`}
                    variant="outline"
                    color="brand.8"
                    w="fit-content"
                  >
                    {t('readArticle')}
                  </Button>
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <PremiumUpgradeModal
        opened={upgradeOpened}
        onClose={() => setUpgradeOpened(false)}
        onUpgrade={triggerUpgrade}
        loading={upgradeLoading}
        featureName="Premium knowledge base articles"
        errorMessage={upgradeError || null}
      />
    </Stack>
  );
}
