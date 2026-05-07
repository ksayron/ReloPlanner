import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import client from '../api/client';
import { fetchCountriesCatalog } from '../api/countries';
import type {
  CertificationStatus,
  Competency,
  CountriesCatalog,
  HardSkillLevel,
  LanguageLevel,
  UserCompetencyInput,
} from '../types';

interface SelectedCompetency {
  competencyId: string;
  type: Competency['type'];
  level: HardSkillLevel | LanguageLevel | CertificationStatus;
}

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'DevOps Engineer',
  'Data Scientist',
  'Data Engineer',
  'Mobile Developer',
  'QA Engineer',
  'Software Architect',
  'Engineering Manager',
];

const HARD_LEVELS: HardSkillLevel[] = ['NONE', 'BASIC', 'PRACTICAL', 'CONFIDENT', 'ADVANCED'];
const LANGUAGE_LEVELS: LanguageLevel[] = ['NONE', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CERT_LEVELS: CertificationStatus[] = ['NONE', 'PLANNED', 'IN_PROGRESS', 'OBTAINED', 'EXPIRED'];

const HARD_LEVEL_LABELS: Record<HardSkillLevel, string> = {
  NONE: 'None - no practical knowledge yet',
  BASIC: 'Basic - understand fundamentals and can read code/configuration',
  PRACTICAL: 'Practical - can use it in simple tasks with some guidance',
  CONFIDENT: 'Confident - can use it independently in day-to-day work',
  ADVANCED: 'Advanced - can design solutions and mentor others',
};

const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getLevelLabel = (
  type: Competency['type'],
  level: HardSkillLevel | LanguageLevel | CertificationStatus,
) => {
  if (type === 'HARD_SKILL') return HARD_LEVEL_LABELS[level as HardSkillLevel];
  return formatEnumLabel(level);
};

const OTHER_CITY_VALUE = '__OTHER_CITY__';

export default function ProfileWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [targetCountry, setTargetCountry] = useState('');
  const [targetCity, setTargetCity] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');

  const [currentCountry, setCurrentCountry] = useState('');
  const [budget] = useState('');
  const [visa] = useState('');

  const [allCompetencies, setAllCompetencies] = useState<Competency[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SelectedCompetency[]>([]);
  const [countriesCatalog, setCountriesCatalog] = useState<CountriesCatalog>({
    target: [],
    source: [],
  });

  useEffect(() => {
    const loadCountries = async () => {
      const data = await fetchCountriesCatalog();
      setCountriesCatalog(data);
    };
    void loadCountries();
  }, []);

  useEffect(() => {
    const loadCompetencies = async () => {
      try {
        const params: Record<string, string> = {};
        if (desiredRole) params.roleName = desiredRole;
        if (targetCountry) params.countryCode = targetCountry;
        const res = await client.get('/competencies', { params });
        setAllCompetencies(res.data);
      } catch {
        setAllCompetencies([]);
      }
    };
    void loadCompetencies();
  }, [desiredRole, targetCountry]);

  const filtered = useMemo(
    () => allCompetencies.filter((competency) => competency.name.toLowerCase().includes(filter.toLowerCase().trim())),
    [allCompetencies, filter],
  );

  const suggestedCitiesByCountry = useMemo(
    () =>
      Object.fromEntries(
        countriesCatalog.target.map((country) => [country.code, country.suggestedCities ?? []]),
      ) as Record<string, string[]>,
    [countriesCatalog.target],
  );

  const getDefaultLevel = (type: Competency['type']) => {
    if (type === 'LANGUAGE') return 'A2';
    if (type === 'CERTIFICATION') return 'NONE';
    return 'BASIC';
  };

  const toggle = (competency: Competency) => {
    setSelected((prev) => {
      const exists = prev.find((item) => item.competencyId === competency.id);
      if (exists) return prev.filter((item) => item.competencyId !== competency.id);
      return [
        ...prev,
        {
          competencyId: competency.id,
          type: competency.type,
          level: getDefaultLevel(competency.type),
        },
      ];
    });
  };

  const setLevel = (competencyId: string, level: HardSkillLevel | LanguageLevel | CertificationStatus) => {
    setSelected((prev) => prev.map((item) => (item.competencyId === competencyId ? { ...item, level } : item)));
  };

  const isSelected = (competencyId: string) => selected.some((item) => item.competencyId === competencyId);

  const toPayloadCompetencies = (): UserCompetencyInput[] =>
    selected.map((item) => {
      if (item.type === 'LANGUAGE') {
        return { competencyId: item.competencyId, languageLevel: item.level as LanguageLevel };
      }
      if (item.type === 'CERTIFICATION') {
        return {
          competencyId: item.competencyId,
          certificationStatus: item.level as CertificationStatus,
        };
      }
      return { competencyId: item.competencyId, hardSkillLevel: item.level as HardSkillLevel };
    });

  const levelOptions = (type: Competency['type']) => {
    if (type === 'LANGUAGE') return LANGUAGE_LEVELS;
    if (type === 'CERTIFICATION') return CERT_LEVELS;
    return HARD_LEVELS;
  };

  const validateStep = (step: number) => {
    if (step === 0) {
      if (!targetCountry || !desiredRole) {
        setError('Goal page: desired country and desired role are required.');
        return false;
      }
      if (yearsExperience < 0) {
        setError('Years of experience must be 0 or more.');
        return false;
      }
    }

    if (step === 1 && !currentCountry) {
      setError('Source page: current country is required.');
      return false;
    }

    setError('');
    return true;
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((step) => Math.min(2, step + 1));
  };

  const prevStep = () => {
    setError('');
    setCurrentStep((step) => Math.max(0, step - 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(0) || !validateStep(1)) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await client.post('/profiles', {
        currentCountry,
        yearsExperience,
        desiredRole,
        targetCountry,
        targetCity: !targetCity || targetCity === OTHER_CITY_VALUE ? undefined : targetCity,
        competencies: toPayloadCompetencies(),
      });
      navigate(`/dashboard/${res.data.id}`);
    } catch {
      setError('Failed to create profile');
    } finally {
      setSubmitting(false);
    }
  };

  const visaLikelyRequired = !!targetCountry && !!currentCountry && targetCountry !== currentCountry;

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Create Relocation Profile</Title>
      {error && <Alert color="red">{error}</Alert>}

      <Stepper active={currentStep}>
        <Stepper.Step label="Goal" description="Destination and role">
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Select
                label="Desired Country *"
                value={targetCountry}
                onChange={(value) => {
                  setTargetCountry(value || '');
                  setTargetCity('');
                }}
                placeholder="Select country"
                data={countriesCatalog.target.map((country) => ({ value: country.code, label: country.name }))}
              />

              <Select
                label="City (optional)"
                value={targetCity}
                onChange={(value) => setTargetCity(value || '')}
                placeholder="Select city (optional)"
                disabled={!targetCountry}
                data={[{ value: '', label: '-- Select city (optional) --' }]
                  .concat((suggestedCitiesByCountry[targetCountry] || []).map((city) => ({ value: city, label: city })))
                  .concat([{ value: OTHER_CITY_VALUE, label: 'Other / Not listed (use country average)' }])}
              />

              <NumberInput
                label="Years of Experience (min 0)"
                min={0}
                max={40}
                value={yearsExperience}
                onChange={(value) => setYearsExperience(Math.max(0, Number(value) || 0))}
              />

              <Select
                label="Desired Role *"
                value={desiredRole}
                onChange={(value) => setDesiredRole(value || '')}
                placeholder="Select role"
                data={ROLES.map((role) => ({ value: role, label: role }))}
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label="Source" description="Current location">
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Select
                label="Current Country *"
                value={currentCountry}
                onChange={(value) => setCurrentCountry(value || '')}
                placeholder="Select country"
                data={countriesCatalog.source.map((country) => ({ value: country.code, label: country.name }))}
              />

              <TextInput
                label="Budget (inactive, planned)"
                value={budget}
                disabled
                placeholder="Will be activated in next iteration"
              />

              <TextInput
                label={`Visa ${visaLikelyRequired ? '(likely required)' : '(inactive, planned)'}`}
                value={visa}
                disabled
                placeholder={
                  visaLikelyRequired
                    ? 'Visa field planned (route differs by source -> goal)'
                    : 'Will be activated in next iteration'
                }
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label="Skills" description="Competencies">
          <Stack>
            <Card withBorder radius="lg" p="lg" className="bg-white">
              <Stack gap="xs">
                <Title order={4}>Skill Levels</Title>
                {HARD_LEVELS.map((level) => (
                  <Text key={level} size="sm">{HARD_LEVEL_LABELS[level]}</Text>
                ))}
              </Stack>
            </Card>

            <TextInput
              placeholder="Search relevant competencies..."
              value={filter}
              onChange={(e) => setFilter(e.currentTarget.value)}
            />

            <Card withBorder radius="lg" p="sm" className="bg-white">
              <ScrollArea h={420}>
                <Stack gap="xs">
                  {filtered.map((competency) => (
                    <Group key={competency.id} justify="space-between" align="center" wrap="nowrap" className="border-b border-slate-100 pb-2">
                      <Group gap="sm" wrap="nowrap" className="min-w-0">
                        <Checkbox checked={isSelected(competency.id)} onChange={() => toggle(competency)} />
                        <Text className="truncate">{competency.name}</Text>
                        <Badge variant="light" color="brand.1">{formatEnumLabel(competency.type)}</Badge>
                      </Group>

                      {isSelected(competency.id) && (
                        <Select
                          w={280}
                          value={selected.find((item) => item.competencyId === competency.id)?.level ?? getDefaultLevel(competency.type)}
                          onChange={(value) =>
                            value && setLevel(competency.id, value as HardSkillLevel | LanguageLevel | CertificationStatus)
                          }
                          data={levelOptions(competency.type).map((level) => ({
                            value: level,
                            label: getLevelLabel(competency.type, level),
                          }))}
                        />
                      )}
                    </Group>
                  ))}

                  {filtered.length === 0 && <Text c="dimmed">No competencies found for current role/country filter.</Text>}
                </Stack>
              </ScrollArea>
            </Card>

            <Text size="sm" c="dimmed">{selected.length} competency(s) selected</Text>
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="light" color="gray" onClick={prevStep} disabled={currentStep === 0}>
          Back
        </Button>
        {currentStep < 2 ? (
          <Button color="brand.7" onClick={nextStep}>Next</Button>
        ) : (
          <Button color="brand.7" onClick={handleSubmit} loading={submitting}>
            Create Profile
          </Button>
        )}
      </Group>
    </Stack>
  );
}
