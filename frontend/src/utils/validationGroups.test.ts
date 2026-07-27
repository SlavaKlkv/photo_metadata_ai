import { FilePreview, ProcessingJob, ValidationMessage } from 'types';
import {
  countValidationGroups,
  getJobValidationGroup,
  getJobsInValidationGroup,
} from './validationGroups';

const makePreview = (
  errors: ValidationMessage[] = [],
  warnings: ValidationMessage[] = [],
): FilePreview => ({
  stock_platform: 'adobe_stock',
  common_fields: [],
  stock_specific: { title: 'Adobe Stock', fields: [] },
  errors,
  warnings,
});

const makeJob = (
  id: string,
  overrides: Partial<ProcessingJob> = {},
): ProcessingJob => ({
  id,
  filename: `${id}.jpg`,
  originalFilename: `${id}.jpg`,
  status: 'done',
  preview: makePreview(),
  ...overrides,
});

const error: ValidationMessage = {
  field: 'title',
  code: 'required',
  message: 'Title is required',
};

const warning: ValidationMessage = {
  field: 'keywords',
  code: 'recommended_words_not_met',
  message: 'Add more keywords',
};

test('файл без ошибок и предупреждений считается готовым', () => {
  expect(getJobValidationGroup(makeJob('a'))).toBe('ready');
});

test('только предупреждения — группа рекомендаций', () => {
  const job = makeJob('a', { preview: makePreview([], [warning]) });

  expect(getJobValidationGroup(job)).toBe('warnings');
});

test('ошибки и предупреждения вместе — только группа ошибок валидации', () => {
  const job = makeJob('a', { preview: makePreview([error], [warning]) });

  expect(getJobValidationGroup(job)).toBe('errors');
});

test('файл с ошибкой обработки не смешивается с ошибками валидации', () => {
  const job = makeJob('a', {
    status: 'error',
    error: 'AI provider failed',
    preview: undefined,
  });

  expect(getJobValidationGroup(job)).toBe('failed');
});

test('файл без preview попадает в ошибки обработки', () => {
  const job = makeJob('a', { preview: undefined });

  expect(getJobValidationGroup(job)).toBe('failed');
});

test('незавершённый файл попадает в ошибки обработки', () => {
  const job = makeJob('a', { status: 'processing', preview: undefined });

  expect(getJobValidationGroup(job)).toBe('failed');
});

test('счётчики групп взаимоисключающие и в сумме дают все файлы', () => {
  const jobs = [
    makeJob('ready-1'),
    makeJob('ready-2'),
    makeJob('warn', { preview: makePreview([], [warning]) }),
    makeJob('err', { preview: makePreview([error], [warning]) }),
    makeJob('failed', { status: 'error', preview: undefined }),
  ];

  const counts = countValidationGroups(jobs);

  expect(counts).toEqual({ ready: 2, warnings: 1, errors: 1, failed: 1 });
  expect(
    counts.ready + counts.warnings + counts.errors + counts.failed,
  ).toBe(jobs.length);
});

test('пустой батч даёт нулевые счётчики', () => {
  expect(countValidationGroups([])).toEqual({
    ready: 0,
    warnings: 0,
    errors: 0,
    failed: 0,
  });
});

test('выборка группы возвращает только её файлы', () => {
  const jobs = [
    makeJob('ready-1'),
    makeJob('warn', { preview: makePreview([], [warning]) }),
  ];

  expect(getJobsInValidationGroup(jobs, 'ready').map((job) => job.id)).toEqual([
    'ready-1',
  ]);
});
