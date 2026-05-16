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
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { fetchCountriesCatalog } from '../api/countries';
import { fetchMyPreferences } from '../api/preferences';
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
  hardLabels?: Partial<Record<HardSkillLevel, string>>,
) => {
  if (type === 'HARD_SKILL' || type === 'DOMAIN_KNOWLEDGE' || type === 'SOFT_SKILL') {
    return hardLabels?.[level as HardSkillLevel] ?? formatEnumLabel(level);
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
  const { t } = useTranslation('wizard');
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
  const [preferencesPrefillDone, setPreferencesPrefillDone] = useState(false);
  const hardLevelLabels: Record<HardSkillLevel, string> = {
    NONE: t('hardLevel.none'),
    BASIC: t('hardLevel.basic'),
    PRACTICAL: t('hardLevel.practical'),
    CONFIDENT: t('hardLevel.confident'),
    ADVANCED: t('hardLevel.advanced'),
  };

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
    if (isEditing || preferencesPrefillDone) return;
    void (async () => {
      const preferences = await fetchMyPreferences();
      if (preferences) {
        setTargetCountry((prev) => prev || preferences.defaultTargetCountry || '');
        setTargetCity((prev) => prev || preferences.defaultTargetCity || '');
        setSavingsCurrency(preferences.preferredCurrency);
        setMonthlyBudgetCurrency(preferences.preferredCurrency);
        setExpectedNetSalaryCurrency(preferences.preferredCurrency);
      }
      setPreferencesPrefillDone(true);
    })();
  }, [isEditing, preferencesPrefillDone]);

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
        setError(t('failedLoadProfileForEditing'));
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [profileId, t]);

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
        setCvModalError(t('resumeParsingNoDraft'));
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
    onFailed: (snapshot) => snapshot.errorMessage ?? t('resumeParsingFailed'),
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
        setError(t('validation.destinationCountryRequired'));
        return false;
      }
      if (jobSearchMonths < 1) {
        setError(t('validation.jobSearchDurationMin'));
        return false;
      }
      if (dependentsCount < 0) {
        setError(t('validation.dependentsNonNegative'));
        return false;
      }
    }

    if (step === 1) {
      if (!desiredRole || !currentCountry) {
        setError(t('validation.jobRoleCountryRequired'));
        return false;
      }
      if (yearsExperience < 0) {
        setError(t('validation.yearsExperienceNonNegative'));
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
    } catch (err: any) {
      const code = String(err?.response?.data?.code ?? '');
      const apiMessage = String(err?.response?.data?.message ?? '').trim();
      if (!isEditing && code === 'PROFILE_LIMIT_REACHED') {
        setError(apiMessage || 'Free plan allows up to 3 profiles. Upgrade to Premium to create more.');
      } else {
        setError(isEditing ? t('failedUpdateProfile') : t('failedCreateProfile'));
      }
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
      setCvModalError(t('selectCvFileBeforeParsing'));
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
      setCvModalError(t('failedStartResumeParsingJob'));
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
          {loadingProfile ? t('loadingProfileData') : t('loadingProfileWizard')}
        </Text>
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>
        {isEditing ? t('editRelocationProfile') : t('createRelocationProfile')}
      </Title>
      {error && <Alert color="red">{error}</Alert>}

      <Modal
        opened={cvModalOpen}
        onClose={() => setCvModalOpen(false)}
        title={t('cvAutoFill')}
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
                {t('cvUploadDescription')}
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
                  {cvFile ? t('selectedFile', { name: cvFile.name }) : t('noFileSelected')}
                </Text>
                <Button color="brand.7" onClick={startCvParseJob}>
                  {t('startParsing')}
                </Button>
              </Group>
            </>
          )}

          {cvModalStage === 'processing' && (
            <JobProgressPanel
              title={t('resumeProcessingProgress')}
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
              retryLabel={t('retryParsing')}
            />
          )}

          {cvModalStage === 'review' && cvDraft && (
            <>
              <Group justify="space-between" wrap="wrap">
                <Title order={4}>{t('reviewExtractedFields')}</Title>
                <Badge color={cvDraft.overallConfidence < LOW_CONFIDENCE_THRESHOLD ? 'yellow' : 'teal'}>
                  {t('overallConfidence')}: {confidencePercent(cvDraft.overallConfidence)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {t('highlightedLowConfidenceHint')}
              </Text>

              <TextInput
                label={t('desiredRole')}
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
                label={t('yearsOfExperience')}
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
                {t('confidence')}: {confidencePercent(cvDraft.yearsExperience.confidence)}
              </Text>

              <Select
                label={t('currentCountry')}
                value={cvReviewCountry}
                onChange={(value) => setCvReviewCountry(value || '')}
                placeholder={t('selectCountry')}
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
                {t('confidence')}: {confidencePercent(cvDraft.currentCountry.confidence)}
              </Text>

              <Card withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Title order={5}>{t('mappedSkills')}</Title>
                    <Text size="sm" c="dimmed">
                      {t('selectedCount', { count: cvReviewCompetencies.filter((item) => item.enabled).length })}
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
                                  label: getLevelLabel(competencyType, level, hardLevelLabels),
                                }))}
                              />
                            </Group>
                          </Card>
                        );
                      })}
                      {cvReviewCompetencies.length === 0 && (
                        <Text size="sm" c="dimmed">
                          {t('noMappedSkillsFromCv')}
                        </Text>
                      )}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Card>

              {cvDraft.unmatchedSkills.length > 0 && (
                <Card withBorder radius="md" p="sm">
                  <Stack gap={4}>
                    <Title order={6}>{t('unmatchedSkills')}</Title>
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
                  {t('uploadAnotherCv')}
                </Button>
                <Button color="brand.7" onClick={applyCvDraftToQuestionary}>
                  {t('applyToQuestionnaire')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={manualSkillModalOpen}
        onClose={() => setManualSkillModalOpen(false)}
        title={t('addAdditionalSkills')}
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('additionalSkillsHint')}
          </Text>
          <TextInput
            placeholder={t('searchUnincludedSkills')}
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
                        {added ? t('added') : t('add')}
                      </Button>
                    </Group>
                  );
                })}
                {manualModalCompetencies.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {t('noUnincludedSkillsFound')}
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </Card>
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setManualSkillModalOpen(false)}>
              {t('close')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Stepper active={currentStep}>
        <Stepper.Step label={t('page1Label')} description={t('page1Description')}>
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Select
                label={t('desiredCountryRequired')}
                value={targetCountry}
                onChange={(value) => {
                  setTargetCountry(value || '');
                  setTargetCity('');
                }}
                placeholder={t('selectCountry')}
                data={countriesCatalog.target.map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
              />

              <Select
                label={t('cityOptional')}
                value={targetCity}
                onChange={(value) => setTargetCity(value || '')}
                placeholder={t('selectCityOptional')}
                disabled={!targetCountry}
                data={[{ value: '', label: t('selectCityOptionalPlaceholder') }]
                  .concat(
                    (suggestedCitiesByCountry[targetCountry] || []).map((city) => ({
                      value: city,
                      label: city,
                    })),
                  )
                  .concat([{ value: OTHER_CITY_VALUE, label: t('otherCityNotListed') }])}
              />

              <Group grow>
                <NumberInput
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Text component="span">{t('savingsAmountOptional')}</Text>
                      <QuestionHelp text={t('help.savingsAmount')} />
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
                      <Text component="span">{t('savingsCurrency')}</Text>
                      <QuestionHelp text={t('help.savingsCurrency')} />
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
                      <Text component="span">{t('monthlyBudgetOptional')}</Text>
                      <QuestionHelp text={t('help.monthlyBudget')} />
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
                      <Text component="span">{t('monthlyBudgetCurrency')}</Text>
                      <QuestionHelp text={t('help.monthlyBudgetCurrency')} />
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
                      <Text component="span">{t('expectedNetSalaryOptional')}</Text>
                      <QuestionHelp text={t('help.expectedNetSalary')} />
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
                      <Text component="span">{t('expectedSalaryCurrency')}</Text>
                      <QuestionHelp text={t('help.expectedSalaryCurrency')} />
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
                      <Text component="span">{t('dependentsCount')}</Text>
                      <QuestionHelp text={t('help.dependentsCount')} />
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
                      <Text component="span">{t('lifestyle')}</Text>
                      <QuestionHelp text={t('help.lifestyle')} />
                    </Group>
                  }
                  value={lifestyle}
                  onChange={(value) => setLifestyle((value as LifestyleProfile) || 'STANDARD')}
                  data={LIFESTYLES.map((item) => ({
                    value: item,
                    label: t(`lifestyleOption.${item}`),
                  }))}
                />
              </Group>

              <NumberInput
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('plannedJobSearchDurationMonths')}</Text>
                    <QuestionHelp text={t('help.plannedJobSearchDurationMonths')} />
                  </Group>
                }
                min={1}
                max={24}
                value={jobSearchMonths}
                onChange={(value) => setJobSearchMonths(Math.max(1, Number(value) || 1))}
              />

              <Title order={5}>{t('legalReadinessInputs')}</Title>

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('existingWorkAuthorization')}</Text>
                    <QuestionHelp text={t('help.existingWorkAuthorization')} />
                  </Group>
                }
                value={booleanSelectValue(hasExistingWorkAuthorization)}
                onChange={(value) =>
                  setHasExistingWorkAuthorization(fromBooleanSelectValue(value))
                }
                data={[
                  { value: 'unknown', label: t('unknownNotSure') },
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('confirmedJobOffer')}</Text>
                    <QuestionHelp text={t('help.confirmedJobOffer')} />
                  </Group>
                }
                value={booleanSelectValue(hasJobOffer)}
                onChange={(value) => setHasJobOffer(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: t('unknownNotSure') },
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('recognizedDegree')}</Text>
                    <QuestionHelp text={t('help.recognizedDegree')} />
                  </Group>
                }
                value={booleanSelectValue(hasRecognizedDegree)}
                onChange={(value) => setHasRecognizedDegree(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: t('unknownNotSure') },
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('formalEducation')}</Text>
                    <QuestionHelp text={t('help.formalEducation')} />
                  </Group>
                }
                value={booleanSelectValue(hasFormalEducation)}
                onChange={(value) => setHasFormalEducation(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: t('unknownNotSure') },
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                ]}
              />

              <Select
                label={
                  <Group gap={6} wrap="nowrap">
                    <Text component="span">{t('relocatingWithFamily')}</Text>
                    <QuestionHelp text={t('help.relocatingWithFamily')} />
                  </Group>
                }
                value={booleanSelectValue(relocationWithFamily)}
                onChange={(value) => setRelocationWithFamily(fromBooleanSelectValue(value))}
                data={[
                  { value: 'unknown', label: t('unknownNotSure') },
                  { value: 'yes', label: t('yes') },
                  { value: 'no', label: t('no') },
                ]}
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label={t('page2Label')} description={t('page2Description')}>
          <Card withBorder radius="lg" p="lg" className="bg-white">
            <Stack>
              <Group justify="space-between" wrap="wrap">
                <Title order={4}>{t('jobProfile')}</Title>
                <Button variant="filled" color="brand.7" onClick={openCvModal}>
                  {t('uploadCvAndAutofill')}
                </Button>
              </Group>

              <Select
                label={t('desiredRoleRequired')}
                value={desiredRole}
                onChange={(value) => setDesiredRole(value || '')}
                placeholder={t('selectRole')}
                data={ROLES.map((role) => ({ value: role, label: t(`role.${role}`) }))}
              />

              <NumberInput
                label={t('yearsOfExperienceMin0')}
                min={0}
                max={40}
                value={yearsExperience}
                onChange={(value) => setYearsExperience(Math.max(0, Number(value) || 0))}
              />

              <Select
                label={t('currentCountryRequired')}
                value={currentCountry}
                onChange={(value) => setCurrentCountry(value || '')}
                placeholder={t('selectCountry')}
                data={countriesCatalog.source.map((country) => ({
                  value: country.code,
                  label: country.name,
                }))}
              />
            </Stack>
          </Card>
        </Stepper.Step>

        <Stepper.Step label={t('page3Label')} description={t('page3Description')}>
          <Stack>
            <Card withBorder radius="lg" p="lg" className="bg-white">
              <Stack gap="xs">
                <Title order={4}>{t('skillLevels')}</Title>
                {HARD_LEVELS.map((level) => (
                  <Text key={level} size="sm">
                    {hardLevelLabels[level]}
                  </Text>
                ))}
              </Stack>
            </Card>

            <TextInput
              placeholder={t('searchRelevantCompetencies')}
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
                            label: getLevelLabel(competency.type, level, hardLevelLabels),
                          }))}
                        />
                      )}
                    </Group>
                  ))}

                  {filtered.length === 0 && (
                    <Text c="dimmed">{t('noCompetenciesFound')}</Text>
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
              {t('addSkillsNotSuggested')}
            </Button>

            <Text size="sm" c="dimmed">
              {t('competenciesSelectedCount', { count: selected.length })}
            </Text>
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button variant="light" color="gray" onClick={prevStep} disabled={currentStep === 0}>
          {t('back')}
        </Button>
        {currentStep < 2 ? (
          <Button color="brand.7" onClick={nextStep}>
            {t('next')}
          </Button>
        ) : (
          <Button color="brand.7" onClick={handleSubmit} loading={submitting}>
            {isEditing ? t('updateProfile') : t('createProfile')}
          </Button>
        )}
      </Group>
    </Stack>
  );
}



