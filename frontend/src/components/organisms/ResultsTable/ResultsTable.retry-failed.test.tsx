import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePreview, ProcessingJob } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { useToastStore } from 'store/useToastStore';
import { jobsApi } from 'services/api/api';
import { ResultsTable } from './ResultsTable';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateSelection: jest.fn(),
    updateMetadata: jest.fn(),
    retryFailed: jest.fn(),
  },
}));

const mockedRetryFailed = jobsApi.retryFailed as jest.Mock;

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollBy = jest.fn();
});

const preview: FilePreview = {
  stock_platform: 'adobe_stock',
  common_fields: [],
  stock_specific: { title: 'Adobe Stock', fields: [] },
  errors: [],
  warnings: [],
};

const makeJob = (
  name: string,
  overrides: Partial<ProcessingJob> = {},
): ProcessingJob => ({
  id: name,
  filename: `${name}.jpg`,
  originalFilename: `${name}.jpg`,
  status: 'done',
  preview,
  selected_for_export: true,
  ...overrides,
});

const jobsWithFailed: ProcessingJob[] = [
  makeJob('ready-1'),
  makeJob('failed-1', { status: 'error', preview: undefined }),
  makeJob('failed-2', { status: 'error', preview: undefined }),
];

const setJobs = (jobs: ProcessingJob[]) => {
  useAppStore.setState({ jobs: jobs.map((job) => ({ ...job })), previews: {} });
};

const httpError = (status: number) => ({ response: { status } });

const getRetryButton = () => screen.getByRole('button', { name: /Retry failed/ });

beforeEach(() => {
  mockedRetryFailed.mockReset();
  mockedRetryFailed.mockResolvedValue({ data: {} });
  setJobs(jobsWithFailed);
  useUIStore.setState({
    currentJobId: 'job-1',
    selectedJobId: null,
    resultsPage: 1,
    validationFilter: null,
    isProcessing: false,
    isPollingActive: false,
    isProgressModalOpen: false,
    processingScopeIds: null,
  });
  useToastStore.setState({ toasts: [] });
});

test('кнопка повтора показывает число упавших файлов', () => {
  render(<ResultsTable />);

  expect(getRetryButton()).toHaveTextContent('Retry failed (2)');
});

test('кнопка повтора стоит последней в ряду действий сводки', () => {
  render(<ResultsTable />);

  const retryButton = getRetryButton();
  const actionButtons = Array.from(
    retryButton.parentElement?.querySelectorAll('button') ?? [],
  );

  expect(actionButtons.length).toBeGreaterThan(1);
  expect(actionButtons[actionButtons.length - 1]).toBe(retryButton);
});

test('без упавших файлов кнопки повтора нет', () => {
  setJobs([makeJob('ready-1')]);

  render(<ResultsTable />);

  expect(
    screen.queryByRole('button', { name: /Retry failed/ }),
  ).not.toBeInTheDocument();
});

test('клик перезапускает упавшие файлы и переводит UI в обработку', async () => {
  render(<ResultsTable />);

  await userEvent.click(getRetryButton());

  await waitFor(() => {
    expect(mockedRetryFailed).toHaveBeenCalledWith('job-1');
  });

  const uiState = useUIStore.getState();
  expect(uiState.isProcessing).toBe(true);
  expect(uiState.isPollingActive).toBe(true);
  expect(uiState.isProgressModalOpen).toBe(true);
});

test('прогресс ограничивается перезапускаемыми файлами', async () => {
  render(<ResultsTable />);

  await userEvent.click(getRetryButton());

  await waitFor(() => {
    expect(useUIStore.getState().processingScopeIds).toEqual([
      'failed-1',
      'failed-2',
    ]);
  });

  // Упавшие файлы сразу возвращаются в очередь, иначе прогресс
  // открылся бы на 100%.
  const statuses = Object.fromEntries(
    useAppStore.getState().jobs.map((job) => [job.id, job.status]),
  );
  expect(statuses).toMatchObject({
    'ready-1': 'done',
    'failed-1': 'queued',
    'failed-2': 'queued',
  });
});

test('сорвавшийся перезапуск не оставляет область прогресса', async () => {
  mockedRetryFailed.mockRejectedValue(httpError(409));

  render(<ResultsTable />);

  await userEvent.click(getRetryButton());

  await waitFor(() => {
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
  expect(useUIStore.getState().processingScopeIds).toBeNull();
  expect(useAppStore.getState().jobs[1].status).toBe('error');
});

test.each([
  [404, 'Job not found — reload the results'],
  [409, 'Processing is already running'],
  [400, 'No failed files to retry'],
])('ошибка %s объясняется пользователю', async (status, message) => {
  mockedRetryFailed.mockRejectedValue(httpError(status as number));

  render(<ResultsTable />);

  await userEvent.click(getRetryButton());

  await waitFor(() => {
    expect(useToastStore.getState().toasts[0]?.message).toBe(message);
  });
  // Сорвавшийся перезапуск не оставляет UI в состоянии обработки.
  expect(useUIStore.getState().isProcessing).toBe(false);
  expect(useUIStore.getState().isPollingActive).toBe(false);
});

test('неизвестная ошибка тоже показывается тостом', async () => {
  mockedRetryFailed.mockRejectedValue(new Error('network down'));

  render(<ResultsTable />);

  await userEvent.click(getRetryButton());

  await waitFor(() => {
    expect(useToastStore.getState().toasts[0]?.message).toBe(
      'Failed to restart failed files',
    );
  });
});
