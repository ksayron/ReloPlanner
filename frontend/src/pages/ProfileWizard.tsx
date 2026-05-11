import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Tooltip,
  Text,
  TextInput,
  Title,
  ActionIcon,
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
  CurrencyCode,
  LifestyleProfile,
} from '../types';

interface SelectedCompetency {
  competencyId: string;
  type: Competency['type'];
  level: HardSkillLevel | LanguageLevel | CertificationStatus;
}

interface CvReviewCompetency extends ResumeMappedCompetency {
  enabled: boolean;
}

interface ExistingProfileResponse {
  id: string;
  targetCountry: string;
  targetCity: string | null;
  currentCountry: string;
  yearsExperience: number;
  desiredRole: string;
  savingsAmount: number | null;
  savingsCurrency: CurrencyCode | null;
  monthlyBudgetAmount: number | null;
  monthlyBudgetCurrency: CurrencyCode | null;
  expectedNetSalaryAmount: number | null;
  expectedNetSalaryCurrency: CurrencyCode | null;
  dependentsCount: number | null;
  lifestyle: LifestyleProfile | null;
  jobSearchMonths: number | null;
  hasExistingWorkAuthorization: boolean | null;
  hasJobOffer: boolean | null;
  hasRecognizedDegree: boolean | null;
  hasFormalEducation: boolean | null;
  relocationWithFamily: boolean | null;
  competencies: Array<{
    competencyId: string;
    competency: { type: Competency['type'] };
    hardSkillLevel?: HardSkillLevel | null;
    languageLevel?: LanguageLevel | null;
    certificationStatus?: CertificationStatus | null;
  }>;
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
const CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH'];
const LIFESTYLES: LifestyleProfile[] = ['FRUGAL', 'STANDARD', 'COMFORTABLE'];

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

const booleanSelectValue = (value: boolean | null | undefined): string =>
  typeof value === 'boolean' ? (value ? 'yes' : 'no') : 'unknown';

const fromBooleanSelectValue = (
  value: string | null,
): boolean | undefined => {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
};

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

function QuestionHelp({ text }: { text: string }) {
  return (
    <Tooltip label={text} multiline w={280} withArrow>
      <ActionIcon
        variant="default"
        color="gray"
        size="sm"
        radius="xl"
        aria-label="Question explanation"
      >
        <Text size="xs" fw={700}>
          ?
        </Text>
      </ActionIcon>
    </Tooltip>
  );
}

export default function ProfileWizard() {
  const navigate = useNavigate();
  const { profileId } = useParams<{ profileId?: string }>();
  const isEditing = Boolean(profileId);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [targetCountry, setTargetCountry] = useState('');
  const [targetCity, setTargetCity] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');
  const [currentCountry, setCurrentCountry] = useState('');
  const [savingsAmount, setSavingsAmount] = useState<number | ''>('');
  const [savingsCurrency, setSavingsCurrency] = useState<CurrencyCode>('USD');
  const [monthlyBudgetAmount, setMonthlyBudgetAmount] = useState<number | ''>('');
  const [monthlyBudgetCurrency, setMonthlyBudgetCurrency] = useState<CurrencyCode>('USD');
  const [expectedNetSalaryAmount, setExpectedNetSalaryAmount] = useState<number | ''>('');
  const [expectedNetSalaryCurrency, setExpectedNetSalaryCurrency] = useState<CurrencyCode>('USD');
  const [dependentsCount, setDependentsCount] = useState(0);
  const [lifestyle, setLifestyle] = useState<LifestyleProfile>('STANDARD');
  const [jobSearchMonths, setJobSearchMonths] = useState(6);
  const [hasExistingWorkAuthorization, setHasExistingWorkAuthorization] = useState<
    boolean | undefined
  >(undefined);
  const [hasJobOffer, setHasJobOffer] = useState<boolean | undefined>(undefined);
  const [hasRecognizedDegree, setHasRecognizedDegree] = useState<boolean | undefined>(undefined);
  const [hasFormalEducation, setHasFormalEducation] = useState<boolean | undefined>(undefined);
  const [relocationWithFamily, setRelocationWithFamily] = useState<boolean | undefined>(
    undefined,
  );

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

  useEffect(() => {
    if (!profileId) return;
    setLoadingProfile(true);
    setError('');
    void (async () => {
      try {
        const response = await client.get<ExistingProfileResponse>(`/profiles/${profileId}`);
        const profile = response.data;
        setTargetCountry(profile.targetCountry ?? '');
        setTargetCity(profile.targetCity ?? '');
        setCurrentCountry(profile.currentCountry ?? '');
        setYearsExperience(Number(profile.yearsExperience ?? 0));
        setDesiredRole(profile.desiredRole ?? '');
        setSavingsAmount(profile.savingsAmount ?? '');
        setSavingsCurrency(profile.savingsCurrency ?? 'USD');
        setMonthlyBudgetAmount(profile.monthlyBudgetAmount ?? '');
        setMonthlyBudgetCurrency(profile.monthlyBudgetCurrency ?? 'USD');
        setExpectedNetSalaryAmount(profile.expectedNetSalaryAmount ?? '');
        setExpectedNetSalaryCurrency(profile.expectedNetSalaryCurrency ?? 'USD');
        setDependentsCount(profile.dependentsCount ?? 0);
        setLifestyle(profile.lifestyle ?? 'STANDARD');
        setJobSearchMonths(profile.jobSearchMonths ?? 6);
        setHasExistingWorkAuthorization(
          profile.hasExistingWorkAuthorization ?? undefined,
        );
        setHasJobOffer(profile.hasJobOffer ?? undefined);
        setHasRecognizedDegree(profile.hasRecognizedDegree ?? undefined);
        setHasFormalEducation(profile.hasFormalEducation ?? undefined);
        setRelocationWithFamily(profile.relocationWithFamily ?? undefined);

        const mappedSelected: SelectedCompetency[] = (profile.competencies ?? []).map((item) => {
          const type = item.competency.type;
          if (type === 'LANGUAGE') {
            return {
              competencyId: item.competencyId,
              type,
              level: (item.languageLevel ?? 'A2') as LanguageLevel,
            };
          }
          if (type === 'CERTIFICATION') {
            return {
              competencyId: item.competencyId,
              type,
              level: (item.certificationStatus ?? 'NONE') as CertificationStatus,
            };
          }
          return {
            competencyId: item.competencyId,
            type,
            level: (item.hardSkillLevel ?? 'BASIC') as HardSkillLevel,
          };
        });

        setSelected(mappedSelected);
      } catch {
        setError('Failed to load profile for editing.');
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [profileId]);

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
      if (jobSearchMonths < 1) {
        setError('Job-search duration must be at least 1 month.');
        return false;
      }
      if (dependentsCount < 0) {
        setError('Dependents count cannot be negative.');
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
      const payload = {
        currentCountry,
        yearsExperience,
        desiredRole,
        targetCountry,
        targetCity: !targetCity || targetCity === OTHER_CITY_VALUE ? undefined : targetCity,
        savingsAmount: savingsAmount === '' ? undefined : Number(savingsAmount),
        savingsCurrency,
        monthlyBudgetAmount:
          monthlyBudgetAmount === '' ? undefined : Number(monthlyBudgetAmount),
        monthlyBudgetCurrency,
        expectedNetSalaryAmount:
          expectedNetSalaryAmount === '' ? undefined : Number(expectedNetSalaryAmount),
        expectedNetSalaryCurrency,
        dependentsCount,
        lifestyle,
        jobSearchMonths,
        hasExistingWorkAuthorization,
        hasJobOffer,
        hasRecognizedDegree,
        hasFormalEducation,
        relocationWithFamily,
        competencies: toPayloadCompetencies(),
      };

      if (isEditing && profileId) {
        await client.patch(`/profiles/${profileId}`, payload);
        navigate(`/dashboard/${profileId}`);
      } else {
        const res = await client.post('/profiles', payload);
        navigate(`/dashboard/${res.data.id}`);
      }
    } catch {
      setError(isEditing ? 'Failed to update profile' : 'Failed to create profile');
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

  if (
    loadingProfile ||
    (!countriesCatalog.target.length && !countriesCatalog.source.length)
  ) {
    return (
      <div className="mt-10 flex justify-center">
        <Text c="dimmed">
          {loadingProfile ? 'Loading profile data...' : 'Loading profile wizard...'}
        </Text>
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>
        {isEditing ? 'Edit Relocation Profile' : 'Create Relocation Profile'}
      </Title>
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

              <Group grow>
                <NumberInput
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Savings Amount (optional)</Text>
                      <QuestionHelp text="How much liquid money you currently have for relocation and first months after arrival." />
                    </Group>
                  }
                  min={0}
                  value={savingsAmount}
                  onChange={(value) =>
                    setSavingsAmount(value === '' || value === null ? '' : Number(value))
                  }
                />
                <Select
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Savings Currency</Text>
                      <QuestionHelp text="Currency of your savings amount. Use the same currency as the value entered on the left." />
                    </Group>
                  }
                  value={savingsCurrency}
                  onChange={(value) => setSavingsCurrency((value as CurrencyCode) || 'USD')}
                  data={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Monthly Budget (optional)</Text>
                      <QuestionHelp text="Planned monthly spending limit in target location while settling and searching for work." />
                    </Group>
                  }
                  min={0}
                  value={monthlyBudgetAmount}
                  onChange={(value) =>
                    setMonthlyBudgetAmount(
                      value === '' || value === null ? '' : Number(value),
                    )
                  }
                />
                <Select
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Monthly Budget Currency</Text>
                      <QuestionHelp text="Currency used for your monthly budget number." />
                    </Group>
                  }
                  value={monthlyBudgetCurrency}
                  onChange={(value) => setMonthlyBudgetCurrency((value as CurrencyCode) || 'USD')}
                  data={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Expected Net Salary (optional)</Text>
                      <QuestionHelp text="Estimated monthly take-home salary after taxes in your target country, if known." />
                    </Group>
                  }
                  min={0}
                  value={expectedNetSalaryAmount}
                  onChange={(value) =>
                    setExpectedNetSalaryAmount(
                      value === '' || value === null ? '' : Number(value),
                    )
                  }
                />
                <Select
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Expected Salary Currency</Text>
                      <QuestionHelp text="Currency for your expected net salary value." />
                    </Group>
                  }
                  value={expectedNetSalaryCurrency}
                  onChange={(value) =>
                    setExpectedNetSalaryCurrency((value as CurrencyCode) || 'USD')
                  }
                  data={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
                />
              </Group>

              <Group grow>
                <NumberInput
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Dependents Count</Text>
                      <QuestionHelp text="People financially depending on you (for example partner, children, or parents)." />
                    </Group>
                  }
                  min={0}
                  max={10}
                  value={dependentsCount}
                  onChange={(value) => setDependentsCount(Math.max(0, Number(value) || 0))}
                />
                <Select
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">Lifestyle</Text>
                      <QuestionHelp text="Spending style used for estimates: frugal, standard, or comfortable living costs." />
                    </Group>
                  }
                  value={lifestyle}
                  onChange={(value) => setLifestyle((value as LifestyleProfile) || 'STANDARD')}
                  data={LIFESTYLES.map((item) => ({
                    value: item,
                    label: formatEnumLabel(item),
                  }))}
                />
              </Group>

              <NumberInput
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Planned Job Search Duration (months)</Text>
                    <QuestionHelp text="How many months you expect to search before receiving an offer. Used for financial runway and risk checks." />
                  </Group>
                }
                min={1}
                max={24}
                value={jobSearchMonths}
                onChange={(value) => setJobSearchMonths(Math.max(1, Number(value) || 1))}
              />

              <Title order={5}>Legal Readiness Inputs</Title>

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Existing work authorization for target country</Text>
                    <QuestionHelp text="Whether you already hold valid residence/work rights for the target country." />
                  </Group>
                }
                value={booleanSelectValue(hasExistingWorkAuthorization)}
                onChange={(value) =>
                  setHasExistingWorkAuthorization(fromBooleanSelectValue(value))
                }
                data={[
                  { value: 'unknown', label: 'Unknown / Not sure' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Confirmed job offer</Text>
                    <QuestionHelp text="Whether you already have a signed or formally confirmed offer from an employer in the target country." />
                  </Group>
                }
                value={booleanSelectValue(hasJobOffer)}
                onChange={(value) => setHasJobOffer(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: 'Unknown / Not sure' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Recognized degree</Text>
                    <QuestionHelp text="Whether your degree is recognized or likely comparable for the target country’s skilled-worker routes." />
                  </Group>
                }
                value={booleanSelectValue(hasRecognizedDegree)}
                onChange={(value) => setHasRecognizedDegree(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: 'Unknown / Not sure' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Formal education</Text>
                    <QuestionHelp text="Whether you have structured formal education (for example university or accredited vocational program)." />
                  </Group>
                }
                value={booleanSelectValue(hasFormalEducation)}
                onChange={(value) => setHasFormalEducation(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: 'Unknown / Not sure' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">Relocating with family</Text>
                    <QuestionHelp text="Family relocation can affect legal steps, required documents, timeline, and monthly expenses." />
                  </Group>
                }
                value={booleanSelectValue(relocationWithFamily)}
                onChange={(value) => setRelocationWithFamily(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: 'Unknown / Not sure' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
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
            {isEditing ? 'Update Profile' : 'Create Profile'}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
