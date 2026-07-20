import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { BottomActionBar } from './BottomActionBar';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateSettings: jest.fn(),
    startProcessing: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

const startButton = () =>
  screen.getByRole('button', { name: /start processing/i });

beforeEach(() => {
  jest.clearAllMocks();
  mockedJobsApi.updateSettings.mockResolvedValue({} as never);
  mockedJobsApi.startProcessing.mockResolvedValue({
    data: { job_id: 'job-1' },
  } as never);

  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'a.jpg',
        originalFilename: 'a.jpg',
        status: 'queued',
      },
    ],
    previews: {},
    draftBatchSettings: {
      shootingContext: 'first context',
      stockPlatform: 'getty_images',
      exportFormats: { csv: true, iptc: false },
    },
    lockedBatchSettings: null,
    sessionSettings: { selectedProvider: 'gemini' },
  });

  useUIStore.setState({
    isUploaded: true,
    isProcessing: false,
    isExportReady: false,
    isExporting: false,
    currentJobId: 'job-1',
  });
});

test('re-enables the start button after a cancelled run', async () => {
  render(<BottomActionBar />);

  // Состояние в разгаре генерации — запуск заблокирован.
  act(() => {
    useAppStore.setState({ isProcessing: true });
    useUIStore.setState({ isProcessing: true });
  });
  await waitFor(() => expect(startButton()).toBeDisabled());

  act(() => {
    useAppStore.getState().cancelBatchProcessing();
    useUIStore.getState().resetProcessingState();
  });

  await waitFor(() => expect(startButton()).toBeEnabled());
});

test('starts a second run with the changed context after cancelling', async () => {
  const user = userEvent.setup();
  render(<BottomActionBar />);

  await user.click(startButton());
  await waitFor(() =>
    expect(mockedJobsApi.updateSettings).toHaveBeenCalledWith('job-1', {
      shooting_context: 'first context',
      stock_platform: 'getty_images',
      ai_provider: 'gemini',
      export_formats: ['csv'],
    }),
  );

  act(() => {
    useAppStore.getState().cancelBatchProcessing();
    useUIStore.getState().resetProcessingState();
    useAppStore
      .getState()
      .updateDraftBatchSetting('shootingContext', 'second context');
  });

  await user.click(startButton());

  // Второй запуск уходит с новым контекстом — прошлая попытка не подмешивается.
  await waitFor(() =>
    expect(mockedJobsApi.updateSettings).toHaveBeenLastCalledWith('job-1', {
      shooting_context: 'second context',
      stock_platform: 'getty_images',
      ai_provider: 'gemini',
      export_formats: ['csv'],
    }),
  );
  expect(mockedJobsApi.startProcessing).toHaveBeenCalledTimes(2);
});
