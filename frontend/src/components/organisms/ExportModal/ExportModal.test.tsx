import { act, render, screen, waitFor } from '@testing-library/react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useToastStore } from 'store/useToastStore';
import { useUIStore } from 'store/useUIStore';
import { ExportModal } from './ExportModal';

jest.mock('services/api/api', () => ({
  jobsApi: {
    startExport: jest.fn(),
    getExportStatus: jest.fn(),
    cancelExport: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockedJobsApi.cancelExport.mockResolvedValue({} as never);
  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'photo.jpg',
        originalFilename: 'photo.jpg',
        status: 'done',
        selected_for_export: true,
      },
    ],
    draftBatchSettings: {
      shootingContext: '',
      stockPlatform: 'adobe_stock',
      exportFormats: { csv: true, iptc: false },
    },
  });
  useUIStore.setState({
    isExportModalOpen: true,
    isSuccessModalOpen: false,
    currentJobId: 'job-1',
    exportArtifacts: [],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test('starts export, stores artifacts and opens success modal', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: {
      export_status: 'completed',
      export_progress: 100,
      export_artifacts: [
        {
          export_format: 'csv',
          filename: 'metadata.csv',
          path: '/tmp/metadata.csv',
          size_bytes: 100,
          count: 1,
        },
      ],
    },
  } as never);

  render(<ExportModal />);

  expect(screen.getByText('Exporting: 0/1')).toBeInTheDocument();
  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalledWith(
      'job-1',
      expect.anything(),
    );
  });
  expect(useUIStore.getState().exportArtifacts).toHaveLength(1);

  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(useUIStore.getState()).toMatchObject({
    isExportModalOpen: false,
    isSuccessModalOpen: true,
  });
});

test('progress bar matches the server export progress', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: {
      export_status: 'processing',
      export_progress: 40,
      export_artifacts: [],
    },
  } as never);

  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'a.jpg',
        originalFilename: 'a.jpg',
        status: 'done',
        selected_for_export: true,
      },
      {
        id: 'file-2',
        filename: 'b.jpg',
        originalFilename: 'b.jpg',
        status: 'done',
        selected_for_export: true,
      },
    ],
  });

  render(<ExportModal />);

  await waitFor(() => {
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
  });
  // Счётчик согласован с процентом: round(40% * 2) = 1 из 2.
  expect(screen.getByText('Exporting: 1/2')).toBeInTheDocument();
});

test('completes export after a previous cancel (no stale cancelled flag)', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: {
      export_status: 'completed',
      export_progress: 100,
      export_artifacts: [],
    },
  } as never);

  const { rerender } = render(<ExportModal />);

  // Пользователь отменяет первый экспорт
  act(() => {
    screen.getByText('Cancel').click();
  });
  expect(useUIStore.getState().isExportModalOpen).toBe(false);

  // Повторное открытие модалки запускает новый экспорт
  act(() => {
    useUIStore.setState({ isExportModalOpen: true, isSuccessModalOpen: false });
  });
  rerender(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(useUIStore.getState()).toMatchObject({
    isExportModalOpen: false,
    isSuccessModalOpen: true,
  });
});

test('keeps polling when the server reports the export is already running', async () => {
  // 409 от бэкенда: задача уже запущена — это не ошибка, просто опрашиваем её
  const conflict = Object.assign(new Error('409'), {
    isAxiosError: true,
    response: { status: 409 },
  });
  mockedJobsApi.startExport.mockRejectedValue(conflict);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'completed', export_progress: 100, export_artifacts: [] },
  } as never);
  useToastStore.setState({ toasts: [] });

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });
  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(useToastStore.getState().toasts).toHaveLength(0);
  expect(useUIStore.getState().isSuccessModalOpen).toBe(true);
});

test('re-exports the same job after a completed export', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'completed', export_progress: 100, export_artifacts: [] },
  } as never);

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.startExport).toHaveBeenCalledTimes(1);
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await waitFor(() => {
    expect(useUIStore.getState().isExportModalOpen).toBe(false);
  });

  // Повторный экспорт того же джоба обязан снова дёрнуть startExport
  act(() => {
    useUIStore.setState({ isExportModalOpen: true, isSuccessModalOpen: false });
  });

  await waitFor(() => {
    expect(mockedJobsApi.startExport).toHaveBeenCalledTimes(2);
  });
});

test('cancels the server job when Cancel is clicked', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'processing', export_progress: 10 },
  } as never);
  mockedJobsApi.cancelExport.mockResolvedValue({} as never);

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });

  act(() => {
    screen.getByText('Cancel').click();
  });

  expect(mockedJobsApi.cancelExport).toHaveBeenCalledWith('job-1');
  expect(useUIStore.getState().isExportModalOpen).toBe(false);
  expect(useUIStore.getState().isExporting).toBe(false);
});

test('cancels the export on Escape', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'processing', export_progress: 10 },
  } as never);

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });

  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(mockedJobsApi.cancelExport).toHaveBeenCalledWith('job-1');
  expect(useUIStore.getState().isExportModalOpen).toBe(false);
});

test('ignores Escape when the modal is closed', () => {
  useUIStore.setState({ isExportModalOpen: false });

  render(<ExportModal />);

  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(mockedJobsApi.cancelExport).not.toHaveBeenCalled();
});

test('stops polling after cancel', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'processing', export_progress: 10 },
  } as never);
  mockedJobsApi.cancelExport.mockResolvedValue({} as never);

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });

  act(() => {
    screen.getByText('Cancel').click();
  });
  const callsAfterCancel = mockedJobsApi.getExportStatus.mock.calls.length;

  await act(async () => {
    jest.advanceTimersByTime(5000);
  });

  expect(mockedJobsApi.getExportStatus).toHaveBeenCalledTimes(callsAfterCancel);
});

test('closes the modal when there is no current job id', () => {
  useUIStore.setState({ currentJobId: null, isExporting: true });

  render(<ExportModal />);

  act(() => {
    screen.getByText('Cancel').click();
  });

  expect(mockedJobsApi.cancelExport).not.toHaveBeenCalled();
  expect(useUIStore.getState().isExportModalOpen).toBe(false);
});

test('closes the modal even if the cancel request fails', async () => {
  mockedJobsApi.startExport.mockResolvedValue({} as never);
  mockedJobsApi.getExportStatus.mockResolvedValue({
    data: { export_status: 'processing', export_progress: 10 },
  } as never);
  mockedJobsApi.cancelExport.mockRejectedValue(new Error('500'));
  const consoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  render(<ExportModal />);

  await waitFor(() => {
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalled();
  });

  act(() => {
    screen.getByText('Cancel').click();
  });

  expect(useUIStore.getState().isExportModalOpen).toBe(false);
  await waitFor(() => {
    expect(consoleError).toHaveBeenCalled();
  });
  consoleError.mockRestore();
});

test('surfaces the validation detail when the backend blocks the export', async () => {
  useToastStore.setState({ toasts: [] });
  mockedJobsApi.startExport.mockRejectedValue(
    Object.assign(new Error('400'), {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          detail: {
            message: 'Export is blocked because metadata has validation errors.',
            files: [
              { filename: 'a.jpg' },
              { filename: 'b.jpg' },
              { filename: 'c.jpg' },
              { filename: 'd.jpg' },
            ],
          },
        },
      },
    }),
  );

  render(<ExportModal />);

  await waitFor(() => {
    expect(useToastStore.getState().toasts).toMatchObject([
      {
        message:
          'Export is blocked because metadata has validation errors. ' +
          '(a.jpg, b.jpg, c.jpg and 1 more)',
        type: 'error',
      },
    ]);
  });
});

test('shows error toast and resets export state when export fails', async () => {
  useUIStore.setState({ isExporting: true });
  useToastStore.setState({ toasts: [] });
  mockedJobsApi.startExport.mockRejectedValue(new Error('500'));

  render(<ExportModal />);

  await waitFor(() => {
    expect(useUIStore.getState().isExportModalOpen).toBe(false);
  });
  expect(useUIStore.getState().isExporting).toBe(false);
  expect(useUIStore.getState().isSuccessModalOpen).toBe(false);
  expect(useToastStore.getState().toasts).toMatchObject([
    { message: 'Export failed', type: 'error' },
  ]);
});
