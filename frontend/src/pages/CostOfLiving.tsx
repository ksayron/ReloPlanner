import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Title,
} from '@mantine/core';
import client from '../api/client';
import type { CostComparison } from '../types';

export default function CostOfLiving() {
  const [cities, setCities] = useState<string[]>([]);
  const [city1, setCity1] = useState('');
  const [city2, setCity2] = useState('');
  const [result, setResult] = useState<CostComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCities = async () => {
      setLoadingCities(true);
      try {
        const res = await client.get('/cost-of-living/cities');
        const cityList = Array.isArray(res.data) ? res.data : [];
        setCities(cityList);
        if (!cityList.includes(city1)) setCity1('');
        if (!cityList.includes(city2)) setCity2('');
      } catch {
        setCities([]);
        setError('Failed to load city options');
      } finally {
        setLoadingCities(false);
      }
    };

    void loadCities();
  }, []);

  const handleCompare = async () => {
    if (!city1 || !city2) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await client.get('/cost-of-living/compare', { params: { city1, city2 } });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to fetch comparison data');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCities) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Cost of Living Comparison</Title>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Group align="end" wrap="wrap">
          <Select
            label="City 1"
            placeholder="Select city"
            data={cities}
            value={city1}
            onChange={(value) => setCity1(value || '')}
            disabled={cities.length === 0}
            w={220}
          />
          <Select
            label="City 2"
            placeholder="Select city"
            data={cities.filter((city) => city !== city1)}
            value={city2}
            onChange={(value) => setCity2(value || '')}
            disabled={cities.length === 0}
            w={220}
          />
          <Button
            onClick={handleCompare}
            loading={loading}
            disabled={cities.length === 0 || !city1 || !city2}
            color="brand.7"
          >
            Compare
          </Button>
        </Group>
      </Paper>

      {cities.length === 0 && (
        <Alert color="yellow">
          No cost-of-living city data is synced yet. Ask an admin to run data sync in Admin - Sync.
        </Alert>
      )}

      {error && <Alert color="red">{error}</Alert>}

      {result && (
        <Paper withBorder radius="lg" p="md" className="bg-white">
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Category</Table.Th>
                <Table.Th className="text-right">{result.city1} (USD)</Table.Th>
                <Table.Th className="text-right">{result.city2} (USD)</Table.Th>
                <Table.Th className="text-right">Diff</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {result.comparison.map((row) => {
                const diff =
                  row.city1Amount != null && row.city2Amount != null
                    ? row.city1Amount - row.city2Amount
                    : null;
                const diffColor = diff != null && diff > 0 ? 'text-red-600' : 'text-emerald-600';
                return (
                  <Table.Tr key={row.category}>
                    <Table.Td>{row.category}</Table.Td>
                    <Table.Td className="text-right">
                      {row.city1Amount != null ? `$${Number(row.city1Amount).toFixed(0)}` : 'N/A'}
                    </Table.Td>
                    <Table.Td className="text-right">
                      {row.city2Amount != null ? `$${Number(row.city2Amount).toFixed(0)}` : 'N/A'}
                    </Table.Td>
                    <Table.Td className={`text-right ${diffColor}`}>
                      {diff != null ? `${diff > 0 ? '+' : ''}$${diff.toFixed(0)}` : 'N/A'}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
