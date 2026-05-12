-- Add REPORT_GENERATION to processing job type enum
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'REPORT_GENERATION';
