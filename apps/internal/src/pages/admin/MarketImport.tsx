import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Radio,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import client from '../../api/client';
import { fetchCountriesCatalog } from '../../api/countries';
import type { CountryOption } from '../../types';

interface SkillRow {
  skillName: string;
  frequency: number;
  avgRequiredLevel: number;
}

export default function MarketImport() {
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [totalVacancies, setTotalVacancies] = useState(0);
  const [jsonMode, setJsonMode] = useState('json');
  const [jsonText, setJsonText] = useState('');
  const [skillRows, setSkillRows] = useState<SkillRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [targetCountries, setTargetCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    const loadCountries = async () => {
      const catalog = await fetchCountriesCatalog();
      setTargetCountries(catalog.target);
    };
    void loadCountries();
  }, []);

  const addRow = () => {
    setSkillRows((prev) => [...prev, { skillName: '', frequency: 0, avgRequiredLevel: 0 }]);
  };

  const updateRow = (index: number, field: keyof SkillRow, value: string | number) => {
    setSkillRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeRow = (index: number) => {
    setSkillRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    let skills: SkillRow[];
    if (jsonMode === 'json') {
      try {
        skills = JSON.parse(jsonText);
        if (!Array.isArray(skills)) throw new Error();
      } catch {
        setError('Invalid JSON array');
        return;
      }
    } else {
      skills = skillRows;
    }

    setSubmitting(true);
    try {
      await client.post('/admin/import/market', {
        country,
        city: city || undefined,
        totalVacancies,
        skills,
      });
      setMessage('Market data imported successfully');
    } catch {
      setError('Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Market Data Import</Title>
      {error && <Alert color="red">{error}</Alert>}
      {message && <Alert color="teal">{message}</Alert>}

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Group grow align="start">
            <Select
              label="Country"
              placeholder="Select country"
              data={targetCountries.map((option) => ({
                value: option.code,
                label: `${option.name} (${option.code})`,
              }))}
              value={country}
              onChange={(value) => setCountry(value || '')}
            />
            <TextInput label="City (optional)" value={city} onChange={(e) => setCity(e.currentTarget.value)} />
          </Group>

          <NumberInput
            label="Total Vacancies"
            min={0}
            value={totalVacancies}
            onChange={(value) => setTotalVacancies(Number(value) || 0)}
            w={220}
          />

          <Radio.Group label="Input mode" value={jsonMode} onChange={setJsonMode}>
            <Group mt="xs">
              <Radio value="json" label="JSON input" />
              <Radio value="manual" label="Manual rows" />
            </Group>
          </Radio.Group>

          {jsonMode === 'json' ? (
            <Textarea
              label="Skills JSON Array"
              value={jsonText}
              onChange={(e) => setJsonText(e.currentTarget.value)}
              minRows={8}
              autosize
              placeholder={'[\n  { "skillName": "React", "frequency": 0.8, "avgRequiredLevel": 0.7 }\n]'}
              className="font-mono"
            />
          ) : (
            <Stack>
              <Group justify="space-between">
                <Text fw={600}>Skills</Text>
                <Button onClick={addRow} color="brand.7" variant="light">+ Add Skill</Button>
              </Group>

              {skillRows.length === 0 && <Text c="dimmed">No skills added yet. Click "+ Add Skill" to begin.</Text>}

              {skillRows.length > 0 && (
                <Table withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Skill</Table.Th>
                      <Table.Th>Frequency (0-1)</Table.Th>
                      <Table.Th>Avg Level (0-1)</Table.Th>
                      <Table.Th className="w-24">Action</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {skillRows.map((row, idx) => (
                      <Table.Tr key={`${row.skillName}-${idx}`}>
                        <Table.Td>
                          <TextInput
                            value={row.skillName}
                            onChange={(e) => updateRow(idx, 'skillName', e.currentTarget.value)}
                            placeholder="Skill name"
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            min={0}
                            max={1}
                            step={0.05}
                            value={row.frequency}
                            onChange={(value) => updateRow(idx, 'frequency', Number(value) || 0)}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            min={0}
                            max={1}
                            step={0.05}
                            value={row.avgRequiredLevel}
                            onChange={(value) => updateRow(idx, 'avgRequiredLevel', Number(value) || 0)}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Button color="red" variant="light" onClick={() => removeRow(idx)}>X</Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          )}

          <Button onClick={handleSubmit} loading={submitting} color="brand.7" w={220}>
            Import Market Data
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
