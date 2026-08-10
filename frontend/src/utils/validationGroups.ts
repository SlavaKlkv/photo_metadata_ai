// frontend/src/utils/validationGroups.ts
import { ProcessingJob } from 'types';

// Группы взаимоисключающие: файл попадает ровно в одну,
// поэтому суммы счётчиков сходятся с общим числом файлов.
export type ValidationGroup = 'ready' | 'errors' | 'warnings' | 'failed';

export const VALIDATION_GROUPS: ValidationGroup[] = [
  'ready',
  'warnings',
  'errors',
  'failed',
];

export const VALIDATION_GROUP_LABELS: Record<ValidationGroup, string> = {
  ready: 'Ready',
  warnings: 'Recommendations',
  errors: 'Required fields missing',
  failed: 'Processing errors',
};

// Короткая подпись для маркера в строке результата
export const VALIDATION_GROUP_SHORT_LABELS: Record<ValidationGroup, string> = {
  ready: 'Ready',
  warnings: 'Check',
  errors: 'Error',
  failed: 'Failed',
};

export const VALIDATION_GROUP_HINTS: Record<ValidationGroup, string> = {
  ready: 'No errors and no recommendations — ready for export',
  warnings: 'Only recommendations — export is still possible',
  errors: 'Required fields are missing — export is invalid',
  failed: 'Processing failed or metadata is unavailable',
};

/**
 * Ошибки валидации важнее предупреждений: файл с тем и другим
 * считается только «required fields missing».
 * Файл без preview отнести к валидации нельзя — это отдельная
 * категория ошибок обработки, а не проблема метаданных.
 */
export const getJobValidationGroup = (job: ProcessingJob): ValidationGroup => {
  if (job.status !== 'done' || !job.preview) return 'failed';
  if (job.preview.errors.length > 0) return 'errors';
  if (job.preview.warnings.length > 0) return 'warnings';

  return 'ready';
};

export const countValidationGroups = (
  jobs: ProcessingJob[],
): Record<ValidationGroup, number> => {
  const counts: Record<ValidationGroup, number> = {
    ready: 0,
    warnings: 0,
    errors: 0,
    failed: 0,
  };

  jobs.forEach((job) => {
    counts[getJobValidationGroup(job)] += 1;
  });

  return counts;
};

export const getJobsInValidationGroup = (
  jobs: ProcessingJob[],
  group: ValidationGroup,
): ProcessingJob[] =>
  jobs.filter((job) => getJobValidationGroup(job) === group);
