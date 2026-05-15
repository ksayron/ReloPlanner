import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type {
  CountriesCatalog,
  MarketDigestCountryResponse,
} from '../types';
import { fetchCountriesCatalog } from '../api/countries';
import { fetchCountryMarketDigest } from '../api/market';

const EMPTY_COUNTRIES: CountriesCatalog = { target: [], source: [] };

export default function Jobs() {
  const [countriesCatalog, setCountriesCatalog] =
    useState<CountriesCatalog>(EMPTY_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [digest, setDigest] = useState<MarketDigestCountryResponse | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingDigest, setLoadingDigest] = useState(false);
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
        setError('Failed to load country list.');
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
        setError(message || 'Failed to load market digest.');
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
        <Title order={2}>Jobs</Title>
        <Select
          label="Country"
          placeholder="Select country"
          data={countryOptions}
          value={selectedCountry}
          onChange={(value) => setSelectedCountry(value || '')}
          w={280}
          disabled={countryOptions.length === 0}
        />
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
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Card withBorder radius="lg" p="lg" className="bg-white">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Total vacancies
                </Text>
                <Text fz="2rem" fw={700}>
                  {digest.totalVacancies != null
                    ? digest.totalVacancies.toLocaleString()
                    : 'N/A'}
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="lg" p="lg" className="bg-white">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Snapshot date
                </Text>
                <Text fw={700}>
                  {digest.snapshotDate
                    ? new Date(digest.snapshotDate).toLocaleDateString()
                    : 'N/A'}
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>

          {!digest.hasData && (
            <Alert color="yellow">
              Market digest is not available yet for this country. Ask an admin
              to run market sync/import.
            </Alert>
          )}

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack gap="sm">
              <Title order={4}>Vacancies by Role</Title>
              {digest.roles.length === 0 ? (
                <Text c="dimmed">No role-level vacancy data available.</Text>
              ) : (
                <Table striped withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Role</Table.Th>
                      <Table.Th className="text-right">Vacancies</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {digest.roles.map((role) => (
                      <Table.Tr key={role.roleName}>
                        <Table.Td>{role.roleName}</Table.Td>
                        <Table.Td className="text-right">
                          {role.vacancies.toLocaleString()}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Card>

          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap">
                <Title order={4}>Top 10 Most Demanded Skills</Title>
                <Badge variant="light" color="brand.1">
                  Top 10
                </Badge>
              </Group>
              {digest.topSkills.length === 0 ? (
                <Text c="dimmed">No skill-demand data available.</Text>
              ) : (
                <Table striped withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Skill</Table.Th>
                      <Table.Th className="text-right">Counter</Table.Th>
                      <Table.Th className="text-right">Frequency</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {digest.topSkills.map((skill) => (
                      <Table.Tr key={skill.skillName}>
                        <Table.Td>{skill.skillName}</Table.Td>
                        <Table.Td className="text-right">
                          {skill.count.toLocaleString()}
                        </Table.Td>
                        <Table.Td className="text-right">
                          {(skill.frequency * 100).toFixed(1)}%
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
}
