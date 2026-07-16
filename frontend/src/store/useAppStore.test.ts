import { jobsApi } from '../services/api/api';
import type { ProcessingJob } from '../types';
import { useAppStore } from './useAppStore';

jest.mock('../services/api/api', () => ({
  jobsApi: {
    providerDiscovery: jest.fn(),
    validateAndSaveProviderApiKey: jest.fn(),
    updateDesktopSettings: jest.fn(),
    getResultsByStock: jest.fn(),
    getStockOptions: jest.fn(),
    regenerateFile: jest.fn(),
  },
}));

const initialState = useAppStore.getState();
const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

const makeJob = (
  id: string,
  status: ProcessingJob['status'] = 'queued',
): ProcessingJob => ({
  id,
  filename: `${id}.jpg`,
  originalFilename: `${id}.jpg`,
  status,
});

beforeEach(() => {
  useAppStore.setState(initialState, true);
  localStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('manages jobs, progress and selections', () => {
  const store = useAppStore.getState();
  store.addJobs([makeJob('one'), makeJob('two', 'done')]);
  store.updateJobStatus('one', 'error', 'failed');
  store.updateMetadata('two', {
    title: 'Title',
    description: 'Description',
    keywords: ['keyword'],
  });
  store.updateJobSelection('one', false);

  expect(useAppStore.getState().getOverallProgress()).toBe(100);
  expect(useAppStore.getState().hasErrors()).toBe(true);
  expect(useAppStore.getState().getFileById('two')?.metadata?.title).toBe(
    'Title',
  );
  expect(
    useAppStore.getState().getFileById('one')?.selected_for_export,
  ).toBe(false);

  useAppStore.getState().updateAllJobsSelection(true);
  expect(
    useAppStore
      .getState()
      .jobs.every((job) => job.selected_for_export === true),
  ).toBe(true);
});

test('locks a copy of batch settings and resets batch state', () => {
  const store = useAppStore.getState();
  store.updateDraftBatchSetting('shootingContext', 'studio');
  store.updateExportFormat('iptc', true);
  store.lockBatchSettings();

  const locked = useAppStore.getState().lockedBatchSettings;
  expect(locked).toMatchObject({
    shootingContext: 'studio',
    exportFormats: { csv: true, iptc: true },
  });

  store.updateExportFormat('iptc', false);
  expect(locked?.exportFormats.iptc).toBe(true);

  useAppStore.getState().resetBatchState();
  expect(useAppStore.getState()).toMatchObject({
    jobs: [],
    lockedBatchSettings: null,
    isProcessing: false,
    previews: {},
  });
});

test('discovers providers and auto-selects the only ready provider', async () => {
  mockedJobsApi.providerDiscovery.mockResolvedValue({
    data: {
      providers: [
        {
          provider: 'gemini',
          display_name: 'Gemini',
          ready: true,
          status: 'ready',
        },
        {
          provider: 'openrouter',
          display_name: 'OpenRouter',
          ready: false,
          status: 'not_ready',
        },
      ],
    },
  } as never);

  await useAppStore.getState().discoverProviders();

  expect(useAppStore.getState()).toMatchObject({
    providerDiscoveryStatus: 'ready',
    availableProviders: ['gemini'],
    sessionSettings: { selectedProvider: 'gemini' },
  });
  expect(useAppStore.getState().providerDiscoveryItems[1]).toMatchObject({
    provider: 'openrouter',
    hints: [],
    configured: false,
    local: false,
  });
});

test('keeps ready state on silent discovery failure', async () => {
  useAppStore.setState({ providerDiscoveryStatus: 'ready' });
  mockedJobsApi.providerDiscovery.mockRejectedValue(new Error('offline'));

  await useAppStore.getState().discoverProviders({ silent: true });

  expect(useAppStore.getState()).toMatchObject({
    providerDiscoveryStatus: 'ready',
    providerDiscoveryError: 'offline',
  });
});

test('validates provider API keys and refreshes discovery', async () => {
  mockedJobsApi.validateAndSaveProviderApiKey.mockResolvedValue({
    data: {
      provider: 'gemini',
      valid: true,
      saved: true,
      status: 'valid',
      message: 'ok',
    },
  } as never);
  mockedJobsApi.providerDiscovery.mockResolvedValue({
    data: {
      providers: [
        {
          provider: 'gemini',
          display_name: 'Gemini',
          ready: true,
          status: 'ready',
        },
      ],
    },
  } as never);

  expect(
    await useAppStore.getState().saveProviderApiKey('ollama', 'key'),
  ).toEqual({
    success: false,
    error: 'Provider does not support API keys',
  });
  expect(
    await useAppStore.getState().saveProviderApiKey('gemini', '   '),
  ).toEqual({
    success: false,
    error: 'API key is required',
  });

  useAppStore.getState().updateProviderApiKey('gemini', 'draft');
  const result = await useAppStore
    .getState()
    .saveProviderApiKey('gemini', ' key ');

  expect(result).toEqual({ success: true });
  expect(
    mockedJobsApi.validateAndSaveProviderApiKey,
  ).toHaveBeenCalledWith('gemini', 'key');
  expect(useAppStore.getState()).toMatchObject({
    sessionSettings: { selectedProvider: 'gemini' },
    manualProviderApiKeys: { gemini: '' },
  });
});

test('loads, saves and completes onboarding', async () => {
  localStorage.setItem(
    'session_settings',
    JSON.stringify({ selectedProvider: 'openrouter' }),
  );
  localStorage.setItem('onboarding_completed', 'true');

  useAppStore.getState().loadSessionSettings();
  expect(useAppStore.getState()).toMatchObject({
    sessionSettings: { selectedProvider: 'openrouter' },
    hasAcceptedOnboarding: true,
  });

  useAppStore.getState().saveSessionSettings();
  expect(JSON.parse(localStorage.getItem('session_settings') ?? '{}')).toEqual({
    selectedProvider: 'openrouter',
  });

  mockedJobsApi.updateDesktopSettings.mockResolvedValue({} as never);
  await useAppStore.getState().completeOnboarding();
  expect(mockedJobsApi.updateDesktopSettings).toHaveBeenCalledWith({
    selected_provider: 'openrouter',
  });
  expect(localStorage.getItem('onboarding_completed')).toBe('true');
});
