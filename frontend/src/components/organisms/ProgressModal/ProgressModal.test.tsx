import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useToastStore } from 'store/useToastStore';
import { useUIStore } from 'store/useUIStore';
import { ProgressModal } from './ProgressModal';

jest.mock('services/api/api', () => ({
  jobsApi: {
    cancel: jest.fn(),
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
  });

  useToastStore.setState({ toasts: [] });
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
