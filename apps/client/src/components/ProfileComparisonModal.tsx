import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import type {
  CompareProfilesResponse,
  ProfileComparisonCategoryResult,
} from '@reloplanner/shared-contracts';
import { compareProfiles } from '../api/profiles';

export interface ProfileComparisonOption {
  id: string;
  desiredRole: string;
  targetCountry: string;
  targetCity: string | null;
}

interface ProfileComparisonModalProps {
  opened: boolean;
  onClose: () => void;
  profiles: ProfileComparisonOption[];
}

const categoryLabels: Record<ProfileComparisonCategoryResult['category'], string> = {
  CAREER_READINESS: 'Career readiness',
  MARKET_OPPORTUNITY: 'Market opportunity',
  FINANCIAL_READINESS: 'Financial readiness',
  IMMIGRATION_SIMPLICITY: 'Immigration simplicity',
  PREPARATION_EFFORT: 'Preparation effort',
  DATA_CONFIDENCE: 'Data confidence',
};

export default function ProfileComparisonModal({
  opened,
  onClose,
  profiles,
}: ProfileComparisonModalProps) {
  const [firstProfileId, setFirstProfileId] = useState<string | null>(null);
  const [secondProfileId, setSecondProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CompareProfilesResponse | null>(null);

  const options = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.id,
        label: `${profile.desiredRole} -> ${profile.targetCountry}${
          profile.targetCity ? `, ${profile.targetCity}` : ''
        }`,
      })),
    [profiles],
  );

  const validationMessage = useMemo(() => {
    if (!firstProfileId || !secondProfileId) {
      return 'Select two profiles to compare.';
    }
    if (firstProfileId === secondProfileId) {
      return 'Please select two different profiles.';
    }
    return '';
  }, [firstProfileId, secondProfileId]);

  const recommendationLabel = useMemo(() => {
    if (!result) return '';
    switch (result.recommendation) {
      case 'FIRST_PROFILE_STRONGER':
      case 'SECOND_PROFILE_STRONGER':
        return 'Better current option';
      case 'SIMILAR_OPTIONS':
        return 'Similar options';
      case 'INSUFFICIENT_DATA':
        return 'Insufficient data';
      default:
        return result.recommendation;
    }
  }, [result]);

  const handleCompare = async () => {
    if (validationMessage || !firstProfileId || !secondProfileId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await compareProfiles({ firstProfileId, secondProfileId });
      setResult(payload);
    } catch (err: any) {
      setResult(null);
      const apiMessage = String(err?.response?.data?.message ?? '').trim();
      setError(apiMessage || 'Failed to compare profiles.');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setError('');
    setLoading(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title="Compare profiles"
      centered
      size="xl"
    >
      <Stack gap="md">
        <Group grow>
          <Select
            label="First profile"
            placeholder="Select first profile"
            data={options}
            value={firstProfileId}
            onChange={setFirstProfileId}
          />
          <Select
            label="Second profile"
            placeholder="Select second profile"
            data={options}
            value={secondProfileId}
            onChange={setSecondProfileId}
          />
        </Group>

        {validationMessage ? <Alert color="yellow">{validationMessage}</Alert> : null}
        {error ? <Alert color="red">{error}</Alert> : null}

        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={closeModal} disabled={loading}>
            Cancel
          </Button>
          <Button
            color="brand.7"
            onClick={handleCompare}
            disabled={Boolean(validationMessage)}
            loading={loading}
          >
            Compare
          </Button>
        </Group>

        {loading ? (
          <Group justify="center" py="md">
            <Loader color="brand.7" />
          </Group>
        ) : null}

        {result ? (
          <Stack gap="sm">
            <Divider />
            <Title order={4}>Profile Comparison</Title>
            <Group justify="space-between" wrap="wrap">
              <Text fw={700}>{recommendationLabel}</Text>
              <Badge
                color={result.recommendation === 'INSUFFICIENT_DATA' ? 'orange' : 'teal'}
                variant="light"
              >
                {result.winnerProfileId
                  ? `Winner: ${
                      result.winnerProfileId === result.firstProfile.profileId
                        ? result.firstProfile.profileName
                        : result.secondProfile.profileName
                    }`
                  : 'No single winner'}
              </Badge>
            </Group>

            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>{result.firstProfile.profileName}</Table.Th>
                  <Table.Th>{result.secondProfile.profileName}</Table.Th>
                  <Table.Th>Better</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.categoryResults.map((row) => (
                  <Table.Tr key={row.category}>
                    <Table.Td>{categoryLabels[row.category]}</Table.Td>
                    <Table.Td>{row.firstProfileScore}</Table.Td>
                    <Table.Td>{row.secondProfileScore}</Table.Td>
                    <Table.Td>
                      {row.betterProfileId
                        ? row.betterProfileId === result.firstProfile.profileId
                          ? result.firstProfile.profileName
                          : result.secondProfile.profileName
                        : 'Similar'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Text>
              <strong>{result.firstProfile.profileName}</strong> overall readiness score:{' '}
              {result.firstProfile.overallScore} / 100
            </Text>
            <Text>
              <strong>{result.secondProfile.profileName}</strong> overall readiness score:{' '}
              {result.secondProfile.overallScore} / 100
            </Text>

            <Text fw={600}>Summary</Text>
            <Text size="sm">{result.summary}</Text>

            <Group align="flex-start" grow>
              <Stack gap={4}>
                <Text fw={600}>{result.firstProfile.profileName} strengths</Text>
                {result.firstProfile.strengths.map((strength) => (
                  <Text size="sm" key={`first-strength-${strength}`}>
                    - {strength}
                  </Text>
                ))}
                <Text fw={600} mt={6}>
                  Weaknesses
                </Text>
                {result.firstProfile.weaknesses.map((weakness) => (
                  <Text size="sm" key={`first-weakness-${weakness}`}>
                    - {weakness}
                  </Text>
                ))}
              </Stack>

              <Stack gap={4}>
                <Text fw={600}>{result.secondProfile.profileName} strengths</Text>
                {result.secondProfile.strengths.map((strength) => (
                  <Text size="sm" key={`second-strength-${strength}`}>
                    - {strength}
                  </Text>
                ))}
                <Text fw={600} mt={6}>
                  Weaknesses
                </Text>
                {result.secondProfile.weaknesses.map((weakness) => (
                  <Text size="sm" key={`second-weakness-${weakness}`}>
                    - {weakness}
                  </Text>
                ))}
              </Stack>
            </Group>

            <Text size="sm" c="dimmed">
              {result.disclaimer}
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Modal>
  );
}
