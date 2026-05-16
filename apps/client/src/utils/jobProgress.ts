import i18n from '../i18n';

export const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const defaultJobStepLabel: Record<string, string> = {
  QUEUED: 'jobs.queued',
  STARTED: 'jobs.started',
  LOAD_PROFILE: 'jobs.loadProfile',
  LOAD_REQUIREMENTS: 'jobs.loadRequirements',
  LOAD_MARKET_SNAPSHOT: 'jobs.loadMarketSnapshot',
  PREPARE_INPUTS: 'jobs.prepareInputs',
  COMPUTE_ANALYSIS: 'jobs.computeAnalysis',
  SAVE_RESULTS: 'jobs.saveResults',
  BUILDING_SNAPSHOT: 'jobs.buildingSnapshot',
  ARTIFACT_READY: 'jobs.artifactReady',
  FILE_PARSED: 'jobs.fileParsed',
  AI_EXTRACTION: 'jobs.aiExtraction',
  MAPPING_TO_QUESTIONNAIRE: 'jobs.mapToQuestionnaire',
  COMPLETED: 'components.completed',
};

export const isTerminalJobStatus = (status: string) =>
  status === 'COMPLETED' || status === 'FAILED';

export const getJobStepLabel = (
  step: string,
  overrides: Record<string, string> = {},
) => {
  if (step.startsWith('SYNCING_COUNTRY:')) {
    const country = step.split(':')[1] ?? i18n.t('jobs.unknown');
    return i18n.t('jobs.syncingCountry', { country });
  }
  if (step.startsWith('COUNTRY_DONE:')) {
    const parts = step.split(':');
    const country = parts[1] ?? i18n.t('jobs.unknown');
    const status = (parts[2] ?? '').toLowerCase();
    return i18n.t('jobs.completedCountry', {
      country,
      status: status ? i18n.t('jobs.completedCountryStatus', { status }) : '',
    });
  }

  const override = overrides[step];
  if (override) return override;

  const key = defaultJobStepLabel[step];
  if (key) return i18n.t(key);

  return formatEnumLabel(step);
};
