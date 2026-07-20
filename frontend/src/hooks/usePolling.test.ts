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
