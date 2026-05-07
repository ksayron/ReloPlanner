export const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const defaultJobStepLabel: Record<string, string> = {
  QUEUED: 'Queued',
  STARTED: 'Started',
  LOAD_PROFILE: 'Load profile',
  LOAD_REQUIREMENTS: 'Load market requirements',
  LOAD_MARKET_SNAPSHOT: 'Load market snapshot',
  PREPARE_INPUTS: 'Prepare analysis inputs',
  COMPUTE_ANALYSIS: 'Compute score and roadmap',
  SAVE_RESULTS: 'Save analysis result',
  COMPLETED: 'Completed',
};

export const isTerminalJobStatus = (status: string) =>
  status === 'COMPLETED' || status === 'FAILED';

export const getJobStepLabel = (
  step: string,
  overrides: Record<string, string> = {},
) => {
  if (step.startsWith('SYNCING_COUNTRY:')) {
    const country = step.split(':')[1] ?? 'Unknown';
    return `Syncing ${country}`;
  }
  if (step.startsWith('COUNTRY_DONE:')) {
    const parts = step.split(':');
    const country = parts[1] ?? 'Unknown';
    const status = (parts[2] ?? '').toLowerCase();
    return `Completed ${country}${status ? ` (${status})` : ''}`;
  }
  return overrides[step] ?? defaultJobStepLabel[step] ?? formatEnumLabel(step);
};
