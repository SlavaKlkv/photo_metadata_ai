import { renderHook, waitFor } from '@testing-library/react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { usePolling } from './usePolling';

jest.mock('services/api/api', () => ({
  jobsApi: {
    getStatus: jest.fn(),
    getResultsByStock: jest.fn(),
    getStockOptions: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;
const initialAppState = useAppStore.getState();
const initialUIState = useUIStore.getState();

beforeEach(() => {
  useAppStore.setState(initialAppState, true);
  useUIStore.setState(initialUIState, true);
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('loads completed results and exposes export readiness', async () => {
  useAppStore.getState().addJobs([
    {
      id: 'file-1',
      filename: 'photo.jpg',
      originalFilename: 'photo.jpg',
      status: 'queued',
    },
  ]);
  useUIStore.setState({
    isPollingActive: true,
    isProcessing: true,
    isProgressModalOpen: true,
  });
  mockedJobsApi.getStatus.mockResolvedValue({
    data: {
      status: 'completed',
      effective_ai_provider: 'gemini',
      effective_ai_model: 'gemini-model',
      files: [
        {
          file_id: 'file-1',
          status: 'completed',
          effective_ai_provider: 'gemini',
          effective_ai_model: 'gemini-model',
        },
      ],
    },
  } as never);
  mockedJobsApi.getResultsByStock.mockResolvedValue({
    data: {
      results: [
        {
          file_id: 'file-1',
          status: 'completed',
          title: 'Generated title',
          description: 'Generated description',
          keywords: ['one'],
          preview: {
            stock_platform: 'getty_images',
            common_fields: [],
            stock_specific: { title: 'Getty', fields: [] },
            errors: [],
            warnings: [],
          },
        },
      ],
    },
  } as never);
  mockedJobsApi.getStockOptions.mockResolvedValue({
    data: {
      stock_platform: 'getty_images',
      categories: [],
      license_types: [],
    },
  } as never);

  const { unmount } = renderHook(() => usePolling('job-1'));

  await waitFor(() => {
    expect(useUIStore.getState().isExportReady).toBe(true);
  });

  expect(useUIStore.getState()).toMatchObject({
    isPollingActive: false,
    isProcessing: false,
    isProgressModalOpen: false,
    currentProcessingProvider: null,
  });
  expect(useAppStore.getState().jobs[0]).toMatchObject({
    status: 'done',
    metadata: {
      title: 'Generated title',
      description: 'Generated description',
      keywords: ['one'],
    },
  });
  expect(useAppStore.getState().stockOptions).toMatchObject({
    stock_platform: 'getty_images',
  });
  unmount();
});

test('loads metadata for files beyond the first results page', async () => {
  useAppStore.getState().addJobs([
    { id: 'file-1', filename: 'a.jpg', originalFilename: 'a.jpg', status: 'queued' },
    { id: 'file-2', filename: 'b.jpg', originalFilename: 'b.jpg', status: 'queued' },
  ]);
  useUIStore.setState({
    isPollingActive: true,
    isProcessing: true,
    isProgressModalOpen: true,
  });
  mockedJobsApi.getStatus.mockResolvedValue({
    data: {
      status: 'completed',
      effective_ai_provider: 'gemini',
      files: [
        { file_id: 'file-1', status: 'completed' },
        { file_id: 'file-2', status: 'completed' },
      ],
    },
  } as never);
  mockedJobsApi.getResultsByStock.mockImplementation(
    (_jobId, _stock, page) =>
      Promise.resolve({
        data: {
          results: [
            {
              file_id: page === 1 ? 'file-1' : 'file-2',
              status: 'completed',
              title: page === 1 ? 'First page title' : 'Second page title',
              description: '',
              keywords: [],
            },
          ],
          pagination: { has_next: page === 1 },
        },
      }) as never,
  );
  mockedJobsApi.getStockOptions.mockResolvedValue({
    data: { stock_platform: 'getty_images', categories: [], license_types: [] },
  } as never);

  const { unmount } = renderHook(() => usePolling('job-1'));

  await waitFor(() => {
    expect(useUIStore.getState().isExportReady).toBe(true);
  });

  // Файл со второй страницы обязан получить свой title, а не остаться пустым.
  const jobs = useAppStore.getState().jobs;
  expect(jobs.find((job) => job.id === 'file-1')?.metadata?.title).toBe(
    'First page title',
  );
  expect(jobs.find((job) => job.id === 'file-2')?.metadata?.title).toBe(
    'Second page title',
  );
  expect(mockedJobsApi.getResultsByStock).toHaveBeenCalledTimes(2);
  unmount();
});

test('stops polling and closes progress after request failure', async () => {
  useUIStore.setState({
    isPollingActive: true,
    isProcessing: true,
    isProgressModalOpen: true,
  });
  mockedJobsApi.getStatus.mockRejectedValue(new Error('offline'));

  const { unmount } = renderHook(() => usePolling('job-1'));

  await waitFor(() => {
    expect(useUIStore.getState().isPollingActive).toBe(false);
  });
  expect(useUIStore.getState()).toMatchObject({
    isProcessing: false,
    isProgressModalOpen: false,
    currentProcessingProvider: null,
  });
  unmount();
});

test('restores the pre-generation state when the job comes back cancelled', async () => {
  useAppStore.getState().addJobs([
    {
      id: 'file-1',
      filename: 'photo.jpg',
      originalFilename: 'photo.jpg',
      status: 'done',
      title: 'Generated title',
    },
  ]);
  useAppStore.setState({
    draftBatchSettings: {
      shootingContext: 'Sunset shoot in Lisbon',
      stockPlatform: 'getty_images',
      exportFormats: { csv: true, iptc: false },
    },
    lockedBatchSettings: {
      shootingContext: 'Sunset shoot in Lisbon',
      stockPlatform: 'getty_images',
      exportFormats: { csv: true, iptc: false },
    },
  });
  useUIStore.setState({
    isPollingActive: true,
    isProcessing: true,
    isProgressModalOpen: true,
    currentProcessingProvider: 'gemini',
  });
  mockedJobsApi.getStatus.mockResolvedValue({
    data: { status: 'cancelled', files: [] },
  } as never);

  renderHook(() => usePolling('job-1'));

  await waitFor(() => {
    expect(useUIStore.getState().isProcessing).toBe(false);
  });

  const appState = useAppStore.getState();
  // Фото вернулись в состояние «только добавлены», контекст сохранён.
  expect(appState.jobs).toEqual([
    {
      id: 'file-1',
      filename: 'photo.jpg',
      originalFilename: 'photo.jpg',
      status: 'queued',
    },
  ]);
  expect(appState.lockedBatchSettings).toBeNull();
  expect(appState.draftBatchSettings.shootingContext).toBe(
    'Sunset shoot in Lisbon',
  );
  expect(useUIStore.getState()).toMatchObject({
    isPollingActive: false,
    isProgressModalOpen: false,
    isExportReady: false,
  });
  // Результаты отменённого прогона не подтягиваются.
  expect(mockedJobsApi.getResultsByStock).not.toHaveBeenCalled();
});

test('keeps finished results when a cancelled status arrives during a retry', async () => {
  useAppStore.getState().addJobs([
    {
      id: 'file-1',
      filename: 'done.jpg',
      originalFilename: 'done.jpg',
      status: 'done',
      title: 'Generated title',
    },
    {
      id: 'file-2',
      filename: 'retried.jpg',
      originalFilename: 'retried.jpg',
      status: 'processing',
    },
  ]);
  useUIStore.setState({
    isPollingActive: true,
    isProcessing: true,
    isProgressModalOpen: true,
    processingScopeIds: ['file-2'],
  });
  mockedJobsApi.getStatus.mockResolvedValue({
    data: { status: 'cancelled', files: [] },
  } as never);

  renderHook(() => usePolling('job-1'));

  await waitFor(() => {
    expect(useUIStore.getState().isProcessing).toBe(false);
  });

  // Батч не сбрасывается: metadata готового файла на месте.
  expect(useAppStore.getState().jobs[0]).toMatchObject({
    status: 'done',
    title: 'Generated title',
  });
  expect(useUIStore.getState()).toMatchObject({
    isPollingActive: false,
    isProgressModalOpen: false,
  });
});
