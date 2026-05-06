export type ProcessingJobType = 'PROFILE_ANALYSIS';

export type ProcessingJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ProcessingJobSnapshot {
  id: string;
  type: ProcessingJobType;
  status: ProcessingJobStatus;
  currentStep: string;
  progressPercent: number;
  errorMessage: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProcessingJobDomainEvent =
  | {
      type: 'JOB_STARTED';
      jobId: string;
      step: string;
      progressPercent: number;
    }
  | {
      type: 'JOB_PROGRESS';
      jobId: string;
      step: string;
      progressPercent: number;
    }
  | {
      type: 'JOB_COMPLETED';
      jobId: string;
      step: string;
      progressPercent: number;
      result?: Record<string, unknown>;
    }
  | {
      type: 'JOB_FAILED';
      jobId: string;
      step: string;
      progressPercent: number;
      errorMessage: string;
    };
