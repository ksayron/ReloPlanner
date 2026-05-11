import { useEffect, useMemo, useState } from 'react';
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
import { fetchKnowledgeList } from '../api/knowledge';
import { confirmCheckout, getBillingStatus, startPremiumCheckout } from '../api/billing';
import PremiumUpgradeModal from '../components/PremiumUpgradeModal';
import type { KnowledgeArticleListItem, KnowledgeCategory } from '../types';

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Categories' },
  { value: 'VISA', label: 'Visa' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'COST', label: 'Cost' },
  { value: 'JOB', label: 'Job' },
  { value: 'CV', label: 'CV' },
  { value: 'LANGUAGE', label: 'Language' },
  { value: 'HOUSING', label: 'Housing' },
];

const COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Countries' },
  { value: 'PL', label: 'Poland' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'DE', label: 'Germany' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
];

export default function KnowledgeList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<KnowledgeArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPlanCode, setCurrentPlanCode] = useState<'FREE' | 'PREMIUM'>('FREE');
  const [upgradeOpened, setUpgradeOpened] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');

  const selectedCountry = searchParams.get('country') ?? '';
  const selectedCategory = searchParams.get('category') ?? '';

  const query = useMemo(() => {
    const next: { country?: string; category?: KnowledgeCategory; language: string } = {
      language: 'en',
    };
    if (selectedCountry) next.country = selectedCountry;
    if (selectedCategory) next.category = selectedCategory as KnowledgeCategory;
    return next;
  }, [selectedCategory, selectedCountry]);

  useEffect(() => {
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetchKnowledgeList(query);
        setItems(response.items);
        setCurrentPlanCode(response.access?.planCode ?? 'FREE');
      } catch {
        setError('Failed to load knowledge base articles.');
      } finally {
        setLoading(false);
      }
    })();
  }, [query]);

  const triggerUpgrade = async () => {
    setUpgradeLoading(true);
    setUpgradeError('');
    try {
      const checkout = await startPremiumCheckout();
      const resolved = await confirmCheckout(checkout.checkoutSessionId);
      if (resolved.paymentStatus === 'SUCCEEDED' && resolved.planCode === 'PREMIUM') {
        const status = await getBillingStatus();
        setCurrentPlanCode(status.plan.code);
        const refreshed = await fetchKnowledgeList(query);
        setItems(refreshed.items);
        setUpgradeOpened(false);
      } else {
        setUpgradeError(
          resolved.errorMessage ??
            'Checkout did not succeed. Development mode may intentionally simulate failures.',
        );
      }
    } catch (err: any) {
      setUpgradeError(String(err?.response?.data?.message ?? 'Upgrade failed'));
    } finally {
      setUpgradeLoading(false);
    }
  };

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
      <Title order={2}>Knowledge Base</Title>
      <Text c="dimmed">
        Curated relocation guidance for legal preparation, job search, cost planning, and adaptation.
      </Text>
      <Group gap="xs">
        <Badge color={currentPlanCode === 'PREMIUM' ? 'teal' : 'gray'} variant="light">
          Plan: {currentPlanCode === 'PREMIUM' ? 'Premium' : 'Free'}
        </Badge>
        <Badge color="grape" variant="light">
          Premium articles available
        </Badge>
      </Group>

      <Group grow>
        <Select
          label="Country"
          data={COUNTRY_OPTIONS}
          value={selectedCountry}
          onChange={onCountryChange}
        />
        <Select
          label="Category"
          data={CATEGORY_OPTIONS}
          value={selectedCategory}
          onChange={onCategoryChange}
        />
      </Group>

      {error && <Alert color="red">{error}</Alert>}
      {loading && (
        <Group justify="center" py="xl">
          <Loader color="brand.7" />
        </Group>
      )}

      {!loading && !error && items.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text c="dimmed">No articles found for selected filters.</Text>
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
                      Premium
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
                    Unlock with Premium
                  </Button>
                ) : (
                  <Button
                    component={RouterLink}
                    to={`/knowledge/${article.slug}?language=${article.language}`}
                    variant="outline"
                    color="brand.8"
                    w="fit-content"
                  >
                    Read Article
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
