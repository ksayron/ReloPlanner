import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  CountryJobPostingsResponse,
  CountriesCatalog,
  JobPosting,
  MarketDigestCountryResponse,
} from '../types';
import { getBillingStatus } from '../api/billing';
import { fetchCountriesCatalog } from '../api/countries';
import {
  fetchCountryJobPostings,
  fetchCountryMarketDigest,
} from '../api/market';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

const EMPTY_COUNTRIES: CountriesCatalog = { target: [], source: [] };
const DEFAULT_PAGE_SIZE = 6;

const extractPostingCity = (location: string) => {
  const normalized = location.trim();
  if (!normalized) return null;
  const [firstChunk] = normalized.split(',');
  const city = firstChunk?.trim();
  return city || normalized;
};

const formatSalary = (posting: JobPosting, language: 'en' | 'ru') => {
  if (posting.salaryMinUsd == null && posting.salaryMaxUsd == null) {
    return null;
  }

  const min = posting.salaryMinUsd != null
    ? posting.salaryMinUsd.toLocaleString(language)
    : null;
  const max = posting.salaryMaxUsd != null
    ? posting.salaryMaxUsd.toLocaleString(language)
    : null;

  if (min && max) return `${min} - ${max} ${posting.salaryCurrency ?? 'USD'}`;
  if (min) return `from ${min} ${posting.salaryCurrency ?? 'USD'}`;
  return `up to ${max} ${posting.salaryCurrency ?? 'USD'}`;
};

export default function Jobs() {
  const { t } = useTranslation('jobsPage');
  const { language } = useAppLanguage();
  const [countriesCatalog, setCountriesCatalog] =
    useState<CountriesCatalog>(EMPTY_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [digest, setDigest] = useState<MarketDigestCountryResponse | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [loadingPostings, setLoadingPostings] = useState(false);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [postingsPage, setPostingsPage] = useState(1);
  const [postings, setPostings] = useState<CountryJobPostingsResponse | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingCountries(true);
      setError('');
      try {
        const catalog = await fetchCountriesCatalog();
        if (!active) return;
        setCountriesCatalog(catalog);
        setSelectedCountry((prev) => prev || catalog.target[0]?.code || '');
      } catch {
        if (!active) return;
        setCountriesCatalog(EMPTY_COUNTRIES);
        setError(t('failedLoadCountries'));
      } finally {
        if (!active) return;
        setLoadingCountries(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingBilling(true);
      try {
        const status = await getBillingStatus();
        if (!active) return;
        setIsPremium(status.plan.code === 'PREMIUM');
      } catch {
        if (!active) return;
        setIsPremium(false);
      } finally {
        if (!active) return;
        setLoadingBilling(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCountry) {
      setDigest(null);
      return;
    }
    let active = true;
    void (async () => {
      setLoadingDigest(true);
      setError('');
      try {
        const response = await fetchCountryMarketDigest(selectedCountry);
        if (!active) return;
        setDigest(response);
      } catch (err: any) {
        if (!active) return;
        const message = String(err?.response?.data?.message ?? '').trim();
        setError(message || t('failedLoadDigest'));
        setDigest(null);
      } finally {
        if (!active) return;
        setLoadingDigest(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedCountry]);

  useEffect(() => {
    setPostingsPage(1);
  }, [selectedCountry]);

  useEffect(() => {
    if (!selectedCountry) {
      setPostings(null);
      return;
    }

    let active = true;
    void (async () => {
      setLoadingPostings(true);
      setError('');
      try {
        const response = await fetchCountryJobPostings(
          selectedCountry,
          postingsPage,
          DEFAULT_PAGE_SIZE,
        );
        if (!active) return;
        setPostings(response);
      } catch (err: any) {
        if (!active) return;
        const message = String(err?.response?.data?.message ?? '').trim();
        setError(message || t('failedLoadPostings'));
        setPostings(null);
      } finally {
        if (!active) return;
        setLoadingPostings(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [postingsPage, selectedCountry, t]);

  const countryOptions = useMemo(
    () =>
      countriesCatalog.target.map((country) => ({
        value: country.code,
        label: `${country.name} (${country.code})`,
      })),
    [countriesCatalog.target],
  );

  if (loadingCountries) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('title')}</Title>
        <Group gap="sm" align="flex-end">
          <Select
            label={t('country')}
            placeholder={t('selectCountry')}
            data={countryOptions}
            value={selectedCountry}
            onChange={(value) => setSelectedCountry(value || '')}
            w={280}
            disabled={countryOptions.length === 0}
          />
          <Badge
            color={isPremium ? 'grape' : 'gray'}
            variant="light"
            mb={2}
          >
            {loadingBilling
              ? t('checkingPlan')
              : isPremium
                ? t('premiumEnabled')
                : t('freePlan')}
          </Badge>
        </Group>
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {loadingDigest && (
        <Paper withBorder radius="lg" p="lg" className="bg-white">
          <Group justify="center">
            <Loader color="brand.7" />
          </Group>
        </Paper>
      )}

      {!loadingDigest && digest && (
        <>
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap">
                <Title order={3}>{t('marketData')}</Title>
                <Badge color="brand.1" variant="light">
                  {selectedCountry}
                </Badge>
              </Group>
              {!digest.hasData && (
                <Alert color="yellow">{t('noData')}</Alert>
              )}
              <Accordion variant="separated" defaultValue="overview">
                <Accordion.Item value="overview">
                  <Accordion.Control>{t('marketOverview')}</Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <Card withBorder radius="md" p="md">
                        <Stack gap={4}>
                          <Text size="sm" c="dimmed">
                            {t('totalVacancies')}
                          </Text>
                          <Text fz="1.7rem" fw={700}>
                            {digest.totalVacancies != null
                              ? digest.totalVacancies.toLocaleString(language)
                              : t('common:unknown', { ns: 'common' })}
                          </Text>
                        </Stack>
                      </Card>
                      <Card withBorder radius="md" p="md">
                        <Stack gap={4}>
                          <Text size="sm" c="dimmed">
                            {t('snapshotDate')}
                          </Text>
                          <Text fw={700}>
                            {digest.snapshotDate
                              ? new Date(digest.snapshotDate).toLocaleDateString(language)
                              : t('common:unknown', { ns: 'common' })}
                          </Text>
                        </Stack>
                      </Card>
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="roles">
                  <Accordion.Control>{t('vacanciesByRole')}</Accordion.Control>
                  <Accordion.Panel>
                    {digest.roles.length === 0 ? (
                      <Text c="dimmed">{t('noRoleData')}</Text>
                    ) : (
                      <Table striped withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('role')}</Table.Th>
                            <Table.Th className="text-right">{t('vacancies')}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {digest.roles.map((role) => (
                            <Table.Tr key={role.roleName}>
                              <Table.Td>{role.roleName}</Table.Td>
                              <Table.Td className="text-right">
                                {role.vacancies.toLocaleString(language)}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="skills">
                  <Accordion.Control>{t('topDemandedSkills')}</Accordion.Control>
                  <Accordion.Panel>
                    {digest.topSkills.length === 0 ? (
                      <Text c="dimmed">{t('noSkillData')}</Text>
                    ) : (
                      <Table striped withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>{t('skill')}</Table.Th>
                            <Table.Th className="text-right">{t('counter')}</Table.Th>
                            <Table.Th className="text-right">{t('frequency')}</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {digest.topSkills.map((skill) => (
                            <Table.Tr key={skill.skillName}>
                              <Table.Td>{skill.skillName}</Table.Td>
                              <Table.Td className="text-right">
                                {skill.count.toLocaleString(language)}
                              </Table.Td>
                              <Table.Td className="text-right">
                                {(skill.frequency * 100).toFixed(1)}%
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack gap="md">
              <Group justify="space-between" wrap="wrap">
                <Title order={3}>{t('jobPostingsForYou')}</Title>
                <Badge color="gray" variant="light">
                  {postings?.total != null ? t('vacanciesFound', { count: postings.total }) : t('vacanciesFound', { count: 0 })}
                </Badge>
              </Group>

              {loadingPostings ? (
                <Group justify="center">
                  <Loader color="brand.7" />
                </Group>
              ) : null}

              {!loadingPostings && postings?.items.length === 0 ? (
                <Text c="dimmed">{t('noPostingsForCountry')}</Text>
              ) : null}

              {!loadingPostings && postings && postings.items.length > 0 ? (
                <div className="relative">
                  <div className={isPremium ? '' : 'blur-[3px] select-none pointer-events-none'}>
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                      {postings.items.map((posting) => (
                        <Card key={posting.id} withBorder radius="md" p="md">
                          <Stack gap={8}>
                            <Group justify="space-between" wrap="nowrap" align="flex-start">
                              <Text fw={700} lineClamp={2}>
                                {posting.title}
                              </Text>
                              <Badge size="xs" color="brand.1" variant="light">
                                {posting.source}
                              </Badge>
                            </Group>
                            <Text size="sm" c="dimmed">
                              {posting.company}
                            </Text>
                            {extractPostingCity(posting.location) ? (
                              <Text size="sm">{extractPostingCity(posting.location)}</Text>
                            ) : null}
                            {formatSalary(posting, language) ? (
                              <Text size="sm" fw={600}>{formatSalary(posting, language)}</Text>
                            ) : (
                              <Text size="sm" c="dimmed">{t('salaryNotSpecified')}</Text>
                            )}
                            {posting.sourceUrl ? (
                              <Button
                                component="a"
                                href={posting.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                size="xs"
                                variant="light"
                                color="brand.8"
                                w="fit-content"
                              >
                                {t('openVacancy')}
                              </Button>
                            ) : null}
                          </Stack>
                        </Card>
                      ))}
                    </SimpleGrid>
                  </div>

                  {!isPremium ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/55">
                      <Stack align="center" gap="xs">
                        <Text fw={600}>{t('premiumOnlyPostings')}</Text>
                        <Button component={RouterLink} to="/plan" color="grape">
                          {t('upgradeToPremium')}
                        </Button>
                      </Stack>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isPremium && postings && postings.totalPages > 1 ? (
                <Group justify="center">
                  <Pagination
                    value={postings.page}
                    onChange={setPostingsPage}
                    total={postings.totalPages}
                    color="brand.7"
                  />
                </Group>
              ) : null}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
