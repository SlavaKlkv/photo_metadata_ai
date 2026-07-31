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
  });
  useToastStore.setState({ toasts: [] });
});

test('кнопка повтора показывает число упавших файлов', () => {
  render(<ResultsTable />);

  expect(getRetryButton()).toHaveTextContent('Retry failed (2)');
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
