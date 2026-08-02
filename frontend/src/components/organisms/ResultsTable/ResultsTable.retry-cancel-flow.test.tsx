// Сквозной сценарий: повтор упавших файлов и его отмена вместе с опросом
// статуса. Отдельные проверки компонентов не ловили гонку, из-за которой
// отмена повтора сбрасывала весь батч в состояние «до обработки».
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePreview, ProcessingJob } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { useToastStore } from 'store/useToastStore';
import { jobsApi } from 'services/api/api';
import { usePolling } from 'hooks/usePolling';
import { ProgressModal } from '../ProgressModal/ProgressModal';
import { ResultsTable } from './ResultsTable';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateSelection: jest.fn(),
    updateMetadata: jest.fn(),
    retryFailed: jest.fn(),
    cancelRetryFailed: jest.fn(),
    cancel: jest.fn(),
    getStatus: jest.fn(),
    getResultsByStock: jest.fn(),
    getStockOptions: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

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

const doneJob: ProcessingJob = {
  id: 'done-1',
  filename: 'done.jpg',
  originalFilename: 'done.jpg',
  status: 'done',
  title: 'Generated title',
  preview,
  selected_for_export: true,
};

const failedJob: ProcessingJob = {
  id: 'failed-1',
  filename: 'failed.jpg',
  originalFilename: 'failed.jpg',
  status: 'error',
  error: 'boom',
  selected_for_export: true,
};

// Бэкенд после отмены повтора возвращает задачу в failed: прерванный файл
// снова упавший, готовый — нетронутым.
const statusAfterCancel = {
  data: {
    status: 'failed',
    files: [
      { file_id: 'done-1', status: 'completed' },
      { file_id: 'failed-1', status: 'failed', error_message: 'Processing cancelled' },
    ],
  },
};

const statusWhileRetrying = {
  data: {
    status: 'processing',
    files: [
      { file_id: 'done-1', status: 'completed' },
      { file_id: 'failed-1', status: 'processing' },
    ],
  },
};

const Harness: React.FC = () => {
  const jobId = useUIStore((state) => state.currentJobId);
  const isPollingActive = useUIStore((state) => state.isPollingActive);

  usePolling(isPollingActive ? jobId : null);

  return (
    <>
      <ResultsTable />
      <ProgressModal />
    </>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  mockedJobsApi.retryFailed.mockResolvedValue({ data: {} } as never);
  mockedJobsApi.cancelRetryFailed.mockResolvedValue({ data: {} } as never);
  mockedJobsApi.updateSelection.mockResolvedValue({ data: {} } as never);
  mockedJobsApi.getStatus.mockResolvedValue(statusWhileRetrying as never);
  mockedJobsApi.getResultsByStock.mockResolvedValue({
    data: {
      results: [
        { file_id: 'done-1', status: 'completed', title: 'Generated title', preview },
        { file_id: 'failed-1', status: 'failed', error_message: 'Processing cancelled' },
      ],
      total: 2,
      page: 1,
      page_size: 100,
    },
  } as never);
  mockedJobsApi.getStockOptions.mockResolvedValue({ data: {} } as never);

  useAppStore.setState({
    jobs: [{ ...doneJob }, { ...failedJob }],
    previews: {},
  });
  useUIStore.setState({
    currentJobId: 'job-1',
    selectedJobId: null,
    resultsPage: 1,
    validationFilter: null,
    isProcessing: false,
    isPollingActive: false,
    isProgressModalOpen: false,
    processingScopeIds: null,
    // Батч уже обработан — открыт экран Review.
    isExportReady: true,
  });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('отмена повтора не сбрасывает батч, пока идёт опрос статуса', async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole('button', { name: /Retry failed/ }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Cancel retry/i })).toBeInTheDocument();
  });

  // Отмена и ответ опроса приходят вперемешку — так и ловится гонка.
  mockedJobsApi.getStatus.mockResolvedValue(statusAfterCancel as never);
  await user.click(screen.getByRole('button', { name: /Cancel retry/i }));

  await waitFor(() => {
    expect(mockedJobsApi.cancelRetryFailed).toHaveBeenCalledWith('job-1');
  });

  // Даём опросу отработать после отмены.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const jobs = useAppStore.getState().jobs;
  expect(jobs[0]).toMatchObject({ status: 'done', title: 'Generated title' });
  expect(jobs[1].status).toBe('error');
  expect(mockedJobsApi.cancel).not.toHaveBeenCalled();
  // Главное, что видит пользователь: экран Review никуда не делся.
  expect(useUIStore.getState().isExportReady).toBe(true);
});

test('отмена повтора оставляет пользователя на экране Review', async () => {
  // Опрос не успевает ответить после отмены — проверяем именно то, что
  // делает сама отмена: раньше она гасила isExportReady и выбрасывала
  // пользователя на шаг Upload с результатами, оставшимися в сторе.
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole('button', { name: /Retry failed/ }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Cancel retry/i })).toBeInTheDocument();
  });

  mockedJobsApi.getStatus.mockImplementation(() => new Promise(() => undefined));
  await user.click(screen.getByRole('button', { name: /Cancel retry/i }));

  await waitFor(() => {
    expect(useUIStore.getState().isProgressModalOpen).toBe(false);
  });

  expect(useUIStore.getState().isExportReady).toBe(true);
  expect(useAppStore.getState().jobs[0]).toMatchObject({
    status: 'done',
    title: 'Generated title',
  });
});
