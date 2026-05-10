import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
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
import JobProgressPanel from '../components/JobProgressPanel';
import { usePersistentJobStream } from '../hooks/usePersistentJobStream';
import type {
  CertificationStatus,
  Competency,
  CountriesCatalog,
  HardSkillLevel,
  LanguageLevel,
  ProcessingJobSnapshot,
  ResumeMappedCompetency,
  ResumeProfileDraft,
  UserCompetencyInput,
} from '../types';

interface SelectedCompetency {
  competencyId: string;
  type: Competency['type'];
  level: HardSkillLevel | LanguageLevel | CertificationStatus;
}

interface CvReviewCompetency extends ResumeMappedCompetency {
  enabled: boolean;
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
const CERT_LEVELS: CertificationStatus[] = [
  'NONE',
  'PLANNED',
  'IN_PROGRESS',
  'OBTAINED',
  'EXPIRED',
];

const HARD_LEVEL_LABELS: Record<HardSkillLevel, string> = {
  NONE: 'None - no practical knowledge yet',
  BASIC: 'Basic - understand fundamentals and can read code/configuration',
  PRACTICAL: 'Practical - can use it in simple tasks with some guidance',
  CONFIDENT: 'Confident - can use it independently in day-to-day work',
  ADVANCED: 'Advanced - can design solutions and mentor others',
};

const OTHER_CITY_VALUE = '__OTHER_CITY__';
const LOW_CONFIDENCE_THRESHOLD = 0.65;

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
  if (type === 'HARD_SKILL' || type === 'DOMAIN_KNOWLEDGE' || type === 'SOFT_SKILL') {
    return HARD_LEVEL_LABELS[level as HardSkillLevel] ?? formatEnumLabel(level);
  }
  return formatEnumLabel(level);
};

const levelOptions = (type: Competency['type']) => {
  if (type === 'LANGUAGE') return LANGUAGE_LEVELS;
  if (type === 'CERTIFICATION') return CERT_LEVELS;
  return HARD_LEVELS;
};

const getDefaultLevel = (type: Competency['type']) => {
  if (type === 'LANGUAGE') return 'A2';
  if (type === 'CERTIFICATION') return 'NONE';
  return 'BASIC';
};

const confidencePercent = (value: number) =>
  `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

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
  const [allCompetencyCatalog, setAllCompetencyCatalog] = useState<Competency[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SelectedCompetency[]>([]);
  const [countriesCatalog, setCountriesCatalog] = useState<CountriesCatalog>({
    target: [],
    source: [],
  });

  const [cvModalOpen, setCvModalOpen] = useState(false);
  const [cvModalStage, setCvModalStage] = useState<'upload' | 'processing' | 'review'>(
    'upload',
  );
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvModalError, setCvModalError] = useState('');
  const [cvDraft, setCvDraft] = useState<ResumeProfileDraft | null>(null);
  const [cvReviewRole, setCvReviewRole] = useState('');
  const [cvReviewYears, setCvReviewYears] = useState(0);
  const [cvReviewCountry, setCvReviewCountry] = useState('');
  const [cvReviewCompetencies, setCvReviewCompetencies] = useState<CvReviewCompetency[]>([]);
  const [manualSkillModalOpen, setManualSkillModalOpen] = useState(false);
  const [manualSkillSearch, setManualSkillSearch] = useState('');

  const suggestedCitiesByCountry = useMemo(
    () =>
      Object.fromEntries(
        countriesCatalog.target.map((country) => [country.code, country.suggestedCities ?? []]),
      ) as Record<string, string[]>,
    [countriesCatalog.target],
  );

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

  useEffect(() => {
    const loadAllCompetencies = async () => {
      try {
        const res = await client.get('/competencies');
        setAllCompetencyCatalog(res.data);
      } catch {
        setAllCompetencyCatalog([]);
      }
    };
    void loadAllCompetencies();
  }, []);

  const relevantCompetencyIds = useMemo(
    () => new Set(allCompetencies.map((competency) => competency.id)),
    [allCompetencies],
  );

  const selectedCompetencyIds = useMemo(
    () => new Set(selected.map((item) => item.competencyId)),
    [selected],
  );

  const manualSelectedCompetencies = useMemo(
    () =>
      allCompetencyCatalog.filter(
        (competency) =>
          selectedCompetencyIds.has(competency.id) &&
          !relevantCompetencyIds.has(competency.id),
      ),
    [allCompetencyCatalog, relevantCompetencyIds, selectedCompetencyIds],
  );

  const displayedCompetencies = useMemo(() => {
    const byId = new Map<string, Competency>();
    for (const competency of allCompetencies) {
      byId.set(competency.id, competency);
    }
    for (const competency of manualSelectedCompetencies) {
      byId.set(competency.id, competency);
    }
    return [...byId.values()];
  }, [allCompetencies, manualSelectedCompetencies]);

  const unincludedCompetencies = useMemo(
    () =>
      allCompetencyCatalog.filter((competency) => !relevantCompetencyIds.has(competency.id)),
    [allCompetencyCatalog, relevantCompetencyIds],
  );

  const manualModalCompetencies = useMemo(
    () =>
      unincludedCompetencies.filter((competency) =>
        competency.name.toLowerCase().includes(manualSkillSearch.toLowerCase().trim()),
      ),
    [manualSkillSearch, unincludedCompetencies],
  );

  const filtered = useMemo(
    () =>
      displayedCompetencies.filter((competency) =>
        competency.name.toLowerCase().includes(filter.toLowerCase().trim()),
      ),
    [displayedCompetencies, filter],
  );

  const loadActiveResumeJob = async () => {
    const res = await client.get('/jobs/active', {
      params: { type: 'RESUME_PROFILE_PARSE' },
    });
    return res.data as ProcessingJobSnapshot | null;
  };

  const {
    job: resumeJob,
    jobHistory: resumeJobHistory,
    error: resumeJobError,
    setError: setResumeJobError,
    startJob: startResumeJob,
  } = usePersistentJobStream({
    enabled: cvModalOpen,
    storageKey: 'job-progress:RESUME_PROFILE_PARSE:wizard',
    streamDisconnectedMessage: 'Resume parsing progress stream disconnected',
    hideCompletedAfterMs: 0,
    loadActiveJob: loadActiveResumeJob,
    onActiveJobRestored: () => {
      setCvModalStage('processing');
      setCvModalError('');
    },
    onCompleted: (snapshot) => {
      const resultPayload = snapshot.result as
        | { draft?: ResumeProfileDraft }
        | null;
      const draft = resultPayload?.draft;
      if (!draft) {
        setCvModalError('Resume parsing completed, but no draft data was returned.');
        setCvModalStage('upload');
        return;
      }

      setCvDraft(draft);
      setCvReviewRole(draft.desiredRole.value ?? desiredRole);
      setCvReviewYears(
        Number.isFinite(draft.yearsExperience.value as number)
          ? Math.max(0, Math.round(draft.yearsExperience.value as number))
          : yearsExperience,
      );
      setCvReviewCountry(draft.currentCountry.value ?? currentCountry);
      setCvReviewCompetencies(
        draft.competencies.map((item) => ({
          ...item,
          enabled: true,
        })),
      );
      setCvModalError('');
      setCvModalStage('review');
    },
    onFailed: (snapshot) => snapshot.errorMessage ?? 'Resume parsing failed',
  });

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

  const addManualSkill = (competency: Competency) => {
    setSelected((prev) => {
      if (prev.some((item) => item.competencyId === competency.id)) return prev;
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

  const setLevel = (
    competencyId: string,
    level: HardSkillLevel | LanguageLevel | CertificationStatus,
  ) => {
    setSelected((prev) =>
      prev.map((item) => (item.competencyId === competencyId ? { ...item, level } : item)),
    );
  };

  const isSelected = (competencyId: string) =>
    selected.some((item) => item.competencyId === competencyId);

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

  const validateStep = (step: number) => {
    if (step === 0) {
      if (!targetCountry) {
        setError('Destination page: desired country is required.');
        return false;
      }
    }

    if (step === 1) {
      if (!desiredRole || !currentCountry) {
        setError('Job page: role and current country are required.');
        return false;
      }
      if (yearsExperience < 0) {
        setError('Years of experience must be 0 or more.');
        return false;
      }
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

  const openCvModal = () => {
    setCvModalError('');
    setResumeJobError('');
    setCvFile(null);
    setCvModalStage('upload');
    setCvModalOpen(true);
  };

  const startCvParseJob = async () => {
    if (!cvFile) {
      setCvModalError('Select a CV file before starting parsing.');
      return;
    }
    setCvModalError('');
    setResumeJobError('');
    setCvModalStage('processing');

    try {
      await startResumeJob(async () => {
        const formData = new FormData();
        formData.append('file', cvFile);
        const response = await client.post('/jobs/resume/parse-profile', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return String(response.data.jobId);
      });
    } catch {
      setCvModalStage('upload');
      setCvModalError('Failed to start resume parsing job.');
    }
  };

  const setCvReviewCompetencyEnabled = (competencyId: string, enabled: boolean) => {
    setCvReviewCompetencies((prev) =>
      prev.map((item) => (item.competencyId === competencyId ? { ...item, enabled } : item)),
    );
  };

  const setCvReviewCompetencyLevel = (
    competencyId: string,
    level: HardSkillLevel | LanguageLevel | CertificationStatus,
  ) => {
    setCvReviewCompetencies((prev) =>
      prev.map((item) => {
        if (item.competencyId !== competencyId) return item;
        if (item.competencyType === 'LANGUAGE') {
          return { ...item, languageLevel: level as LanguageLevel };
        }
        if (item.competencyType === 'CERTIFICATION') {
          return { ...item, certificationStatus: level as CertificationStatus };
        }
        return { ...item, hardSkillLevel: level as HardSkillLevel };
      }),
    );
  };

  const applyCvDraftToQuestionary = () => {
    setDesiredRole(cvReviewRole || desiredRole);
    setYearsExperience(Math.max(0, Number(cvReviewYears) || 0));
    setCurrentCountry(cvReviewCountry || currentCountry);

    const mappedSelected: SelectedCompetency[] = cvReviewCompetencies
      .filter((item) => item.enabled)
      .map((item) => {
        if (item.competencyType === 'LANGUAGE') {
          return {
            competencyId: item.competencyId,
            type: item.competencyType,
            level: (item.languageLevel ?? 'A2') as LanguageLevel,
          };
        }
        if (item.competencyType === 'CERTIFICATION') {
          return {
            competencyId: item.competencyId,
            type: item.competencyType,
            level: (item.certificationStatus ?? 'NONE') as CertificationStatus,
          };
        }
        return {
          competencyId: item.competencyId,
          type: item.competencyType,
          level: (item.hardSkillLevel ?? 'BASIC') as HardSkillLevel,
        };
      });

    setSelected(mappedSelected);
    setCvModalOpen(false);
    setCvModalStage('upload');
    setCvModalError('');
    setResumeJobError('');
    setCurrentStep(1);
  };

  const lowRoleConfidence =
    cvDraft?.desiredRole && cvDraft.desiredRole.confidence < LOW_CONFIDENCE_THRESHOLD;
  const lowYearsConfidence =
    cvDraft?.yearsExperience &&
    cvDraft.yearsExperience.confidence < LOW_CONFIDENCE_THRESHOLD;
  const lowCountryConfidence =
    cvDraft?.currentCountry && cvDraft.currentCountry.confidence < LOW_CONFIDENCE_THRESHOLD;

  if (!countriesCatalog.target.length && !countriesCatalog.source.length) {
    return (
      <div className="mt-10 flex justify-center">
        <Text c="dimmed">Loading profile wizard...</Text>
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Create Relocation Profile</Title>
      {error && <Alert color="red">{error}</Alert>}

      <Modal
        opened={cvModalOpen}
        onClose={() => setCvModalOpen(false)}
        title="CV Auto-Fill"
        size="lg"
        centered
      >
        <Stack gap="md">
          {(cvModalError || resumeJobError) && (
            <Alert color="red">{cvModalError || resumeJobError}</Alert>
          )}

          {cvModalStage === 'upload' && (
            <>
              <Text size="sm" c="dimmed">
                Upload resume (PDF/TXT/DOCX). We will parse text, run AI extraction, and map to
                role + experience + skills questionnaire fields.
              </Text>
              <input
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setCvFile(file);
                }}
              />
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {cvFile ? `Selected: ${cvFile.name}` : 'No file selected'}
                </Text>
                <Button color="brand.7" onClick={startCvParseJob}>
                  Start Parsing
                </Button>
              </Group>
            </>
          )}

          {cvModalStage === 'processing' && (
            <JobProgressPanel
              title="Resume Processing Progress"
              job={
                resumeJob ?? {
                  id: 'resume-parse-running',
                  type: 'RESUME_PROFILE_PARSE',
                  status: 'RUNNING',
                  currentStep: 'QUEUED',
                  progressPercent: 0,
                  errorMessage: null,
                  payload: null,
                  result: null,
                  startedAt: null,
                  completedAt: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              }
              jobHistory={resumeJobHistory}
              onRetry={startCvParseJob}
              retryLabel="Retry Parsing"
            />
          )}

          {cvModalStage === 'review' && cvDraft && (
            <>
              <Group justify="space-between" wrap="wrap">
                <Title order={4}>Review Extracted Fields</Title>
                <Badge color={cvDraft.overallConfidence < LOW_CONFIDENCE_THRESHOLD ? 'yellow' : 'teal'}>
                  Overall confidence: {confidencePercent(cvDraft.overallConfidence)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Highlighted fields have lower confidence. All fields are editable before applying.
              </Text>

              <TextInput
                label="Desired Role"
                value={cvReviewRole}
                onChange={(event) => setCvReviewRole(event.currentTarget.value)}
                styles={{
                  input: lowRoleConfidence
                    ? { borderColor: 'var(--mantine-color-yellow-6)', backgroundColor: '#fff9db' }
                    : undefined,
                }}
                rightSection={
                  <Badge size="xs" color={lowRoleConfidence ? 'yellow' : 'teal'}>
                    {confidencePercent(cvDraft.desiredRole.confidence)}
                  </Badge>
                }
              />

              <NumberInput
                label="Years of Experience"
                min={0}
                max={50}
                value={cvReviewYears}
                onChange={(value) => setCvReviewYears(Math.max(0, Number(value) || 0))}
                styles={{
                  input: lowYearsConfidence
                    ? { borderColor: 'var(--mantine-color-yellow-6)', backgroundColor: '#fff9db' }
                    : undefined,
                }}
              />
              <Text size="xs" c="dimmed">
                Confidence: {confidencePercent(cvDraft.yearsExperience.confidence)}
              </Text>

              <Select
                label="Current Country"
                value={cvReviewCountry}
                onChange={(value) => setCvReviewCountry(value || '')}
                placeholder="Select country"
                data={countriesCatalog.source.map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
                styles={{
                  input: lowCountryConfidence
                    ? { borderColor: 'var(--mantine-color-yellow-6)', backgroundColor: '#fff9db' }
                    : undefined,
                }}
              />
              <Text size="xs" c="dimmed">
                Confidence: {confidencePercent(cvDraft.currentCountry.confidence)}
              </Text>

              <Card withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Title order={5}>Mapped Skills</Title>
                    <Text size="sm" c="dimmed">
                      {cvReviewCompetencies.filter((item) => item.enabled).length} selected
                    </Text>
                  </Group>
                  <ScrollArea h={240}>
                    <Stack gap="xs">
                      {cvReviewCompetencies.map((item) => {
                        const lowConfidence = item.confidence < LOW_CONFIDENCE_THRESHOLD;
                        const competencyType = item.competencyType as Competency['type'];
                        const levelValue =
                          competencyType === 'LANGUAGE'
                            ? item.languageLevel ?? 'A2'
                            : competencyType === 'CERTIFICATION'
                              ? item.certificationStatus ?? 'NONE'
                              : item.hardSkillLevel ?? 'BASIC';

                        return (
                          <Card
                            key={item.competencyId}
                            withBorder
                            radius="sm"
                            p="xs"
                            className={lowConfidence ? 'bg-yellow-50' : 'bg-white'}
                          >
                            <Group justify="space-between" align="center" wrap="nowrap">
                              <Group gap="sm" wrap="nowrap">
                                <Checkbox
                                  checked={item.enabled}
                                  onChange={(event) =>
                                    setCvReviewCompetencyEnabled(
                                      item.competencyId,
                                      event.currentTarget.checked,
                                    )
                                  }
                                />
                                <Stack gap={2}>
                                  <Text>{item.competencyName}</Text>
                                  <Group gap={6}>
                                    <Badge size="xs" variant="light" color="brand.1">
                                      {formatEnumLabel(item.competencyType)}
                                    </Badge>
                                    <Badge size="xs" color={lowConfidence ? 'yellow' : 'teal'}>
                                      {confidencePercent(item.confidence)}
                                    </Badge>
                                  </Group>
                                </Stack>
                              </Group>
                              <Select
                                w={250}
                                disabled={!item.enabled}
                                value={levelValue}
                                onChange={(value) =>
                                  value &&
                                  setCvReviewCompetencyLevel(
                                    item.competencyId,
                                    value as HardSkillLevel | LanguageLevel | CertificationStatus,
                                  )
                                }
                                data={levelOptions(competencyType).map((level) => ({
                                  value: level,
                                  label: getLevelLabel(competencyType, level),
                                }))}
                              />
                            </Group>
                          </Card>
                        );
                      })}
                      {cvReviewCompetencies.length === 0 && (
                        <Text size="sm" c="dimmed">
                          No skills were mapped from this CV. You can still fill skills manually on
                          page 3.
                        </Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Card>

              {cvDraft.unmatchedSkills.length > 0 && (
                <Card withBorder radius="md" p="sm">
                  <Stack gap={4}>
                    <Title order={6}>Unmatched skills (not mapped)</Title>
                    {cvDraft.unmatchedSkills.slice(0, 12).map((item, index) => (
                      <Text key={`${item.name}-${index}`} size="sm" c="dimmed">
                        {item.name} ({confidencePercent(item.confidence)})
                      </Text>
                    ))}
                  </Stack>
                </Card>
              )}

              <Group justify="space-between">
                <Button variant="light" color="gray" onClick={() => setCvModalStage('upload')}>
                  Upload Another CV
                </Button>
                <Button color="brand.7" onClick={applyCvDraftToQuestionary}>
                  Apply to Questionnaire
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={manualSkillModalOpen}
        onClose={() => setManualSkillModalOpen(false)}
        title="Add Additional Skills"
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Skills below are not in the current role/country relevance list. Add any you still
            want to include.
          </Text>
          <TextInput
            placeholder="Search unincluded skills..."
            value={manualSkillSearch}
            onChange={(event) => setManualSkillSearch(event.currentTarget.value)}
          />
          <Card withBorder radius="md" p="sm">
            <ScrollArea h={320}>
              <Stack gap="xs">
                {manualModalCompetencies.map((competency) => {
                  const added = isSelected(competency.id);
                  return (
                    <Group
                      key={`manual-${competency.id}`}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                      className="border-b border-slate-100 pb-2"
                    >
                      <Group gap="sm" wrap="nowrap">
                        <Text>{competency.name}</Text>
                        <Badge variant="light" color="gray">
                          {formatEnumLabel(competency.type)}
                        </Badge>
                      </Group>
                      <Button
                        size="xs"
                        variant={added ? 'light' : 'filled'}
                        color={added ? 'teal' : 'brand.7'}
                        disabled={added}
                        onClick={() => addManualSkill(competency)}
                      >
                        {added ? 'Added' : 'Add'}
                      </Button>
                    </Group>
                  );
                })}
                {manualModalCompetencies.length === 0 && (
                  <Text size="sm" c="dimmed">
                    No unincluded skills found.
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Card>
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setManualSkillModalOpen(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Stepper active={currentStep}>
        <Stepper.Step label="Page 1" description="Destination & constraints">
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
                data={countriesCatalog.target.map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
              />

              <Select
                label="City (optional)"
                value={targetCity}
                onChange={(value) => setTargetCity(value || '')}
                placeholder="Select city (optional)"
                disabled={!targetCountry}
                data={[{ value: '', label: '-- Select city (optional) --' }]
                  .concat(
                    (suggestedCitiesByCountry[targetCountry] || []).map((city) => ({
                      value: city,
                      label: city,
                    })),
                  )
                  .concat([
                    { value: OTHER_CITY_VALUE, label: 'Other / Not listed (use country average)' },
                  ])}
              />

              <TextInput
                label="Budget (inactive, planned)"
                value={budget}
                disabled
                placeholder="Will be activated in next iteration"
              />

              <TextInput
                label="Visa (inactive, planned)"
                value={visa}
                disabled
                placeholder="Will be activated in next iteration"
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label="Page 2" description="Role and experience">
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Group justify="space-between" wrap="wrap">
                <Title order={4}>Job Profile</Title>
                <Button variant="filled" color="brand.7" onClick={openCvModal}>
                  Upload CV and Auto-Fill
                </Button>
              </Group>

              <Select
                label="Desired Role *"
                value={desiredRole}
                onChange={(value) => setDesiredRole(value || '')}
                placeholder="Select role"
                data={ROLES.map((role) => ({ value: role, label: role }))}
              />

              <NumberInput
                label="Years of Experience (min 0)"
                min={0}
                max={40}
                value={yearsExperience}
                onChange={(value) => setYearsExperience(Math.max(0, Number(value) || 0))}
              />

              <Select
                label="Current Country *"
                value={currentCountry}
                onChange={(value) => setCurrentCountry(value || '')}
                placeholder="Select country"
                data={countriesCatalog.source.map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label="Page 3" description="Skills">
          <Stack>
            <Card withBorder radius="lg" p="lg" className="bg-white">
              <Stack gap="xs">
                <Title order={4}>Skill Levels</Title>
                {HARD_LEVELS.map((level) => (
                  <Text key={level} size="sm">
                    {HARD_LEVEL_LABELS[level]}
                  </Text>
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
                    <Group
                      key={competency.id}
                      justify="space-between"
                      align="center"
                      wrap="nowrap"
                      className="border-b border-slate-100 pb-2"
                    >
                      <Group gap="sm" wrap="nowrap" className="min-w-0">
                        <Checkbox
                          checked={isSelected(competency.id)}
                          onChange={() => toggle(competency)}
                        />
                        <Text className="truncate">{competency.name}</Text>
                        <Badge variant="light" color="brand.1">
                          {formatEnumLabel(competency.type)}
                        </Badge>
                      </Group>

                      {isSelected(competency.id) && (
                        <Select
                          w={280}
                          value={
                            selected.find((item) => item.competencyId === competency.id)?.level ??
                            getDefaultLevel(competency.type)
                          }
                          onChange={(value) =>
                            value &&
                            setLevel(
                              competency.id,
                              value as HardSkillLevel | LanguageLevel | CertificationStatus,
                            )
                          }
                          data={levelOptions(competency.type).map((level) => ({
                            value: level,
                            label: getLevelLabel(competency.type, level),
                          }))}
                        />
                      )}
                    </Group>
                  ))}

                  {filtered.length === 0 && (
                    <Text c="dimmed">No competencies found for current role/country filter.</Text>
                  )}
                </Stack>
              </ScrollArea>
            </Card>

            <Button
              variant="outline"
              color="brand.8"
              onClick={() => {
                setManualSkillSearch('');
                setManualSkillModalOpen(true);
              }}
              w="fit-content"
            >
              Add skills not in suggested list
            </Button>

            <Text size="sm" c="dimmed">
              {selected.length} competency(s) selected
            </Text>
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="light" color="gray" onClick={prevStep} disabled={currentStep === 0}>
          Back
        </Button>
        {currentStep < 2 ? (
          <Button color="brand.7" onClick={nextStep}>
            Next
          </Button>
        ) : (
          <Button color="brand.7" onClick={handleSubmit} loading={submitting}>
            Create Profile
          </Button>
        )}
      </Group>
    </Stack>
  );
}
