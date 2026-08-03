import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useToastStore } from 'store/useToastStore';
import { useUIStore } from 'store/useUIStore';
import { ProgressModal } from './ProgressModal';

jest.mock('services/api/api', () => ({
  jobsApi: {
    cancel: jest.fn(),
    cancelRetryFailed: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

const lockedSettings = {
  shootingContext: 'Sunset shoot in Lisbon',
  stockPlatform: 'getty_images' as const,
  exportFormats: { csv: true, iptc: false },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedJobsApi.cancel.mockResolvedValue({} as never);
  mockedJobsApi.cancelRetryFailed.mockResolvedValue({} as never);

  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'a.jpg',
        originalFilename: 'a.jpg',
        status: 'done',
        title: 'Generated title',
      },
      {
        id: 'file-2',
        filename: 'b.jpg',
        originalFilename: 'b.jpg',
        status: 'processing',
      },
    ],
    draftBatchSettings: { ...lockedSettings },
    lockedBatchSettings: { ...lockedSettings },
    isProcessing: true,
  });

  useUIStore.setState({
    isProgressModalOpen: true,
    isProcessing: true,
    isPollingActive: true,
    currentJobId: 'job-1',
    currentProcessingProvider: 'gemini',
    processingScopeIds: null,
  });

  useToastStore.setState({ toasts: [] });
});

const makeJobs = (total: number, doneCount: number) =>
  Array.from({ length: total }, (_, index) => ({
    id: `file-${index + 1}`,
    filename: `f-${index + 1}.jpg`,
    originalFilename: `f-${index + 1}.jpg`,
    status: index < doneCount ? ('done' as const) : ('processing' as const),
  }));

test('progress bar reflects the real processed/total ratio', () => {
  useAppStore.setState({ jobs: makeJobs(104, 2) });
  render(<ProgressModal />);

  expect(screen.getByText('Processing: 2/104')).toBeInTheDocument();
  // 2/104 ≈ 2%, а не искусственные 20%.
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
});

test('progress bar is empty when nothing is processed yet', () => {
  useAppStore.setState({ jobs: makeJobs(104, 0) });
  render(<ProgressModal />);

  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('progress bar is full when all files are processed', () => {
  useAppStore.setState({ jobs: makeJobs(4, 4) });
  render(<ProgressModal />);

  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

test('counts only the retried files during a partial run', () => {
  // 10 файлов, 8 из прошлого прогона готовы, перезапускаются два упавших.
  const jobs = makeJobs(10, 8);
  useAppStore.setState({
    jobs: jobs.map((job, index) =>
      index >= 8 ? { ...job, status: 'queued' as const } : job,
    ),
  });
  useUIStore.setState({ processingScopeIds: ['file-9', 'file-10'] });

  render(<ProgressModal />);

  expect(screen.getByText('Processing: 0/2')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('advances the partial run counter as retried files finish', () => {
  const jobs = makeJobs(10, 8);
  useAppStore.setState({
    jobs: jobs.map((job, index) =>
      index === 8
        ? { ...job, status: 'done' as const }
        : index === 9
          ? { ...job, status: 'processing' as const }
          : job,
    ),
  });
  useUIStore.setState({ processingScopeIds: ['file-9', 'file-10'] });

  render(<ProgressModal />);

  expect(screen.getByText('Processing: 1/2')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
});

test('falls back to the whole batch when no scope is set', () => {
  useAppStore.setState({ jobs: makeJobs(10, 8) });
  useUIStore.setState({ processingScopeIds: null });

  render(<ProgressModal />);

  expect(screen.getByText('Processing: 8/10')).toBeInTheDocument();
});

describe('cancelling a partial run', () => {
  beforeEach(() => {
    useAppStore.setState({
      jobs: [
        {
          id: 'file-1',
          filename: 'a.jpg',
          originalFilename: 'a.jpg',
          status: 'done',
          title: 'Generated title',
        },
        {
          id: 'file-2',
          filename: 'b.jpg',
          originalFilename: 'b.jpg',
          status: 'processing',
        },
      ],
    });
    // Экран Review открыт: по этому флагу App рендерит результаты.
    useUIStore.setState({
      processingScopeIds: ['file-2'],
      isExportReady: true,
    });
  });

  test('uses the retry-specific cancel endpoint', async () => {
    const user = userEvent.setup();
    render(<ProgressModal />);

    await user.click(screen.getByRole('button', { name: /cancel retry/i }));

    await waitFor(() => {
      expect(mockedJobsApi.cancelRetryFailed).toHaveBeenCalledWith('job-1');
    });
    // Полный сброс батча не вызывается — иначе готовые файлы обнулятся.
    expect(mockedJobsApi.cancel).not.toHaveBeenCalled();
  });

  test('keeps finished files and returns retried ones to failed', async () => {
    const user = userEvent.setup();
    render(<ProgressModal />);

    await user.click(screen.getByRole('button', { name: /cancel retry/i }));

    await waitFor(() => {
      expect(useUIStore.getState().isProgressModalOpen).toBe(false);
    });

    const [doneJob, retriedJob] = useAppStore.getState().jobs;
    expect(doneJob).toMatchObject({ status: 'done', title: 'Generated title' });
    expect(retriedJob).toMatchObject({
      status: 'error',
      error: 'Processing cancelled',
    });
    expect(useAppStore.getState().isProcessing).toBe(false);
    // Область прогона переживает отмену: запоздавший ответ опроса иначе
    // принял бы её за отмену всего батча и стёр результаты.
    expect(useUIStore.getState().processingScopeIds).toEqual(['file-2']);
    // Пользователь остаётся на экране Review, а не улетает на Upload.
    expect(useUIStore.getState().isExportReady).toBe(true);
  });

  test('still unblocks the UI when the request fails', async () => {
    mockedJobsApi.cancelRetryFailed.mockRejectedValue(new Error('network'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(<ProgressModal />);

    await user.click(screen.getByRole('button', { name: /cancel retry/i }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
    expect(useUIStore.getState().isProcessing).toBe(false);
    expect(useAppStore.getState().jobs[0].status).toBe('done');
  });
});

test('cancels the job on the server and unblocks the UI', async () => {
  const user = userEvent.setup();
  render(<ProgressModal />);

  await user.click(screen.getByRole('button', { name: /cancel/i }));

  await waitFor(() => {
    expect(mockedJobsApi.cancel).toHaveBeenCalledWith('job-1');
  });

  await waitFor(() => {
    expect(useUIStore.getState().isProcessing).toBe(false);
  });

  // Настройки снова редактируемы, прогон полностью остановлен.
  expect(useAppStore.getState().lockedBatchSettings).toBeNull();
  expect(useUIStore.getState()).toMatchObject({
    isPollingActive: false,
    isProgressModalOpen: false,
    currentProcessingProvider: null,
  });
});

test('restores photos to the just-added state and keeps the context', async () => {
  const user = userEvent.setup();
  render(<ProgressModal />);

  await user.click(screen.getByRole('button', { name: /cancel/i }));

  await waitFor(() => {
    expect(useAppStore.getState().jobs.every((job) => job.status === 'queued')).toBe(
      true,
    );
  });

  const state = useAppStore.getState();
  expect(state.jobs).toHaveLength(2);
  expect(state.jobs[0].title).toBeUndefined();
  expect(state.draftBatchSettings.shootingContext).toBe('Sunset shoot in Lisbon');
});

test('unblocks the UI and warns when the cancel request fails', async () => {
  mockedJobsApi.cancel.mockRejectedValue(new Error('network down'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  const user = userEvent.setup();
  render(<ProgressModal />);

  await user.click(screen.getByRole('button', { name: /cancel/i }));

  await waitFor(() => {
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  // Даже при сетевой ошибке пользователь не остаётся в залипшей модалке.
  expect(useUIStore.getState().isProcessing).toBe(false);
  expect(useAppStore.getState().lockedBatchSettings).toBeNull();
});

test('cancels the run on Escape', async () => {
  const user = userEvent.setup();
  render(<ProgressModal />);

  await user.keyboard('{Escape}');

  await waitFor(() => {
    expect(mockedJobsApi.cancel).toHaveBeenCalledWith('job-1');
  });

  // Esc проходит тот же путь, что и кнопка: без залипших флагов.
  await waitFor(() => {
    expect(useUIStore.getState().isProcessing).toBe(false);
  });
  expect(useAppStore.getState().lockedBatchSettings).toBeNull();
  expect(useAppStore.getState().jobs.every((job) => job.status === 'queued')).toBe(
    true,
  );
});

test('does not react to Escape once the modal is closed', async () => {
  const user = userEvent.setup();
  useUIStore.setState({ isProgressModalOpen: false });
  render(<ProgressModal />);

  await user.keyboard('{Escape}');

  expect(mockedJobsApi.cancel).not.toHaveBeenCalled();
});

test('ignores repeated clicks while cancelling', async () => {
  let resolveCancel: () => void = () => undefined;
  mockedJobsApi.cancel.mockReturnValue(
    new Promise((resolve) => {
      resolveCancel = () => resolve({} as never);
    }) as never,
  );

  const user = userEvent.setup();
  render(<ProgressModal />);

  const cancelButton = screen.getByRole('button', { name: /cancel/i });
  await user.click(cancelButton);
  await user.click(cancelButton);

  expect(mockedJobsApi.cancel).toHaveBeenCalledTimes(1);

  resolveCancel();
  await waitFor(() => {
    expect(useUIStore.getState().isProcessing).toBe(false);
  });
});

describe('stepwise counter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  test('plays intermediate numbers when a batch of files finishes at once', () => {
    useAppStore.setState({ jobs: makeJobs(10, 0) });
    const { rerender } = render(<ProgressModal />);

    expect(screen.getByText('Processing: 0/10')).toBeInTheDocument();

    // Опрос принёс сразу шесть готовых файлов — раньше номер прыгал 0 → 6
    act(() => {
      useAppStore.setState({ jobs: makeJobs(10, 6) });
    });
    rerender(<ProgressModal />);

    advance(40);
    expect(screen.getByText('Processing: 1/10')).toBeInTheDocument();
    // Полоса считается из показанного числа, а не из отдельного процента
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '10',
    );

    advance(40);
    expect(screen.getByText('Processing: 2/10')).toBeInTheDocument();

    advance(400);
    expect(screen.getByText('Processing: 6/10')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
  });

  test('advances the retry-failed counter the same way', () => {
    // Повтор упавших идёт через тот же счётчик: своя область, но
    // те же пошаговые номера
    const jobs = makeJobs(10, 8).map((job, index) =>
      index >= 8 ? { ...job, status: 'processing' as const } : job,
    );
    useAppStore.setState({ jobs });
    useUIStore.setState({ processingScopeIds: ['file-9', 'file-10'] });

    const { rerender } = render(<ProgressModal />);
    expect(screen.getByText('Processing: 0/2')).toBeInTheDocument();

    act(() => {
      useAppStore.setState({
        jobs: jobs.map((job, index) =>
          index >= 8 ? { ...job, status: 'done' as const } : job,
        ),
      });
    });
    rerender(<ProgressModal />);

    advance(40);
    expect(screen.getByText('Processing: 1/2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50',
    );

    advance(40);
    expect(screen.getByText('Processing: 2/2')).toBeInTheDocument();
  });

  test('freezes the counter once cancel is pressed', () => {
    useAppStore.setState({ jobs: makeJobs(10, 0) });
    const { rerender } = render(<ProgressModal />);

    act(() => {
      screen.getByRole('button', { name: /cancel/i }).click();
    });

    act(() => {
      useAppStore.setState({ jobs: makeJobs(10, 9) });
    });
    rerender(<ProgressModal />);

    advance(2000);

    // Отменённый прогон не доигрывает номера
    expect(screen.getByText('Processing: 0/10')).toBeInTheDocument();
  });
});
