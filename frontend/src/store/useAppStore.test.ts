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
    checkForUpdates: jest.fn(),
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

const availableUpdate = {
  status: 'ok' as const,
  update_available: true,
  current_version: '1.0.0',
  latest_version: '1.1.0',
  release_url: 'https://github.com/example/releases/tag/v1.1.0',
  download_url: 'https://github.com/example/releases/download/v1.1.0/app.dmg',
};

test('shows an available update that has not been dismissed', async () => {
  mockedJobsApi.checkForUpdates.mockResolvedValue({
    data: availableUpdate,
  } as never);

  await useAppStore.getState().checkForUpdates();

  expect(useAppStore.getState()).toMatchObject({
    updateInfo: availableUpdate,
    isUpdateBannerVisible: true,
  });
  expect(mockedJobsApi.checkForUpdates).toHaveBeenCalledWith();
});

test.each([
  { ...availableUpdate, status: 'unavailable' as const },
  { ...availableUpdate, status: 'disabled' as const },
  { ...availableUpdate, update_available: false },
])('does not show a banner for a non-actionable response', async (data) => {
  mockedJobsApi.checkForUpdates.mockResolvedValue({ data } as never);

  await useAppStore.getState().checkForUpdates();

  expect(useAppStore.getState()).toMatchObject({
    updateInfo: data,
    isUpdateBannerVisible: false,
  });
});

test('silently ignores update check failures', async () => {
  mockedJobsApi.checkForUpdates.mockRejectedValue(new Error('offline'));

  await expect(
    useAppStore.getState().checkForUpdates(),
  ).resolves.toBeUndefined();
  expect(useAppStore.getState()).toMatchObject({
    updateInfo: null,
    isUpdateBannerVisible: false,
  });
});

test('keeps a dismissed version hidden', async () => {
  localStorage.setItem('update_dismissed_version', '1.1.0');
  mockedJobsApi.checkForUpdates.mockResolvedValue({
    data: availableUpdate,
  } as never);

  await useAppStore.getState().checkForUpdates();

  expect(useAppStore.getState().isUpdateBannerVisible).toBe(false);
});

test('dismisses the current version and persists the choice', () => {
  useAppStore.setState({
    updateInfo: availableUpdate,
    isUpdateBannerVisible: true,
  });

  useAppStore.getState().dismissUpdateBanner();

  expect(localStorage.getItem('update_dismissed_version')).toBe('1.1.0');
  expect(useAppStore.getState().isUpdateBannerVisible).toBe(false);
});

describe('cancelBatchProcessing', () => {
  test('restores photos to the just-added state and keeps the context', () => {
    useAppStore.setState({
      jobs: [
        {
          ...makeJob('a', 'done'),
          title: 'Generated title',
          description: 'Generated description',
          keywords: ['one', 'two'],
          effective_ai_provider: 'gemini',
          effective_ai_model: 'gemini-pro',
          field_sources: { title: 'generated' },
          preview: { errors: [] } as never,
          metadata: {
            title: 'Generated title',
            description: 'Generated description',
            keywords: ['one', 'two'],
          },
        },
        { ...makeJob('b', 'processing'), error: 'boom' },
      ],
      draftBatchSettings: {
        shootingContext: 'Sunset shoot in Lisbon',
        stockPlatform: 'shutterstock',
        exportFormats: { csv: true, iptc: true },
      },
      lockedBatchSettings: {
        shootingContext: 'Sunset shoot in Lisbon',
        stockPlatform: 'shutterstock',
        exportFormats: { csv: true, iptc: true },
      },
      isProcessing: true,
    });

    useAppStore.getState().cancelBatchProcessing();

    const state = useAppStore.getState();

    // Список фото сохранён целиком, но без результатов прогона.
    expect(state.jobs).toEqual([
      { id: 'a', filename: 'a.jpg', originalFilename: 'a.jpg', status: 'queued' },
      { id: 'b', filename: 'b.jpg', originalFilename: 'b.jpg', status: 'queued' },
    ]);

    // Введённый контекст и настройки не тронуты.
    expect(state.draftBatchSettings.shootingContext).toBe(
      'Sunset shoot in Lisbon',
    );
    expect(state.draftBatchSettings.exportFormats).toEqual({
      csv: true,
      iptc: true,
    });
  });

  test('unlocks settings so they become editable again', () => {
    useAppStore.setState({
      lockedBatchSettings: {
        shootingContext: 'locked context',
        stockPlatform: 'getty_images',
        exportFormats: { csv: true, iptc: false },
      },
      isProcessing: true,
      regeneratingFileId: 'a',
    });

    useAppStore.getState().cancelBatchProcessing();

    expect(useAppStore.getState()).toMatchObject({
      lockedBatchSettings: null,
      isProcessing: false,
      regeneratingFileId: null,
    });
  });

  test('allows a second run with a changed context', () => {
    useAppStore.setState({
      jobs: [makeJob('a', 'done')],
      draftBatchSettings: {
        shootingContext: 'first context',
        stockPlatform: 'getty_images',
        exportFormats: { csv: true, iptc: false },
      },
    });

    useAppStore.getState().cancelBatchProcessing();
    useAppStore
      .getState()
      .updateDraftBatchSetting('shootingContext', 'second context');
    useAppStore.getState().lockBatchSettings();

    expect(useAppStore.getState().lockedBatchSettings?.shootingContext).toBe(
      'second context',
    );
    expect(useAppStore.getState().jobs[0].status).toBe('queued');
  });
});

test('disabling a provider persists it and drops it from available list', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
      {
        provider: 'openrouter',
        displayName: 'OpenRouter',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: false,
      },
    ],
    availableProviders: ['gemini'],
  });
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['gemini', 'openrouter'] },
  } as never);

  await useAppStore.getState().setProviderEnabled('gemini', false);

  expect(mockedJobsApi.updateDesktopSettings).toHaveBeenCalledWith({
    disabled_providers: ['gemini', 'openrouter'],
  });
  expect(useAppStore.getState().availableProviders).toEqual([]);
  expect(useAppStore.getState().pendingProviderToggle).toBeNull();
});

test('toggle keeps its position until the backend confirms', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ],
    availableProviders: ['gemini'],
  });
  let resolveRequest: (value: unknown) => void = () => undefined;
  mockedJobsApi.updateDesktopSettings.mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }) as never,
  );

  const pending = useAppStore.getState().setProviderEnabled('gemini', false);

  // Пока запрос в пути — положение тумблера не меняется.
  expect(useAppStore.getState().providerDiscoveryItems[0].enabled).toBe(true);
  expect(useAppStore.getState().pendingProviderToggle).toBe('gemini');

  resolveRequest({ data: { disabled_providers: ['gemini'] } });
  await pending;

  expect(useAppStore.getState().providerDiscoveryItems[0].enabled).toBe(false);
});

test('a second toggle is ignored while the first one is saving', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ],
    pendingProviderToggle: 'gemini',
  });

  await useAppStore.getState().setProviderEnabled('gemini', false);

  expect(mockedJobsApi.updateDesktopSettings).not.toHaveBeenCalled();
});

test('disabling the selected provider moves selection down the chain', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ],
    sessionSettings: { selectedProvider: 'ollama' },
  });
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'], selected_provider: 'gemini' },
  } as never);

  await useAppStore.getState().setProviderEnabled('ollama', false);

  expect(useAppStore.getState().sessionSettings.selectedProvider).toBe(
    'gemini',
  );
  expect(useAppStore.getState().draftBatchSettings.aiProvider).toBe('gemini');
});

test('clears selection immediately when the fallback provider is unavailable', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: false,
        status: 'not_ready',
        hints: [],
        configured: false,
        local: false,
        enabled: true,
      },
    ],
    sessionSettings: { selectedProvider: 'ollama' },
  });
  // Бэкенд перевёл выбор на gemini, но у gemini нет ключа (ready: false).
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'], selected_provider: 'gemini' },
  } as never);

  await useAppStore.getState().setProviderEnabled('ollama', false);

  expect(useAppStore.getState().sessionSettings.selectedProvider).toBeNull();
  expect(useAppStore.getState().availableProviders).toEqual([]);
});

test('auto-selects when adding makes exactly one provider available', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: false,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: false,
      },
    ] as never,
    sessionSettings: { selectedProvider: null } as never,
  });
  // Бэкенд подтверждает включение gemini, но своего selected_provider не шлёт.
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'] },
  } as never);

  await useAppStore.getState().setProviderEnabled('gemini', true);

  expect(useAppStore.getState().availableProviders).toEqual(['gemini']);
  // Единственный доступный — выбираем сразу, даже при добавлении.
  expect(useAppStore.getState().sessionSettings.selectedProvider).toBe(
    'gemini',
  );
});

test('leaves “Select provider” when adding a second available provider', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: false,
      },
    ] as never,
    sessionSettings: { selectedProvider: null } as never,
  });
  // ollama уже доступна; включаем gemini — доступных становится двое.
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: [] },
  } as never);

  await useAppStore.getState().setProviderEnabled('gemini', true);

  expect(useAppStore.getState().availableProviders).toEqual([
    'ollama',
    'gemini',
  ]);
  // Несколько доступных без выбора — пользователь выбирает сам.
  expect(useAppStore.getState().sessionSettings.selectedProvider).toBeNull();
});

test('auto-selects the last available provider when removing the others', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ] as never,
    sessionSettings: { selectedProvider: null } as never,
  });
  // Убираем ollama; выбранного не было, бэкенд свой selected_provider не шлёт.
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'] },
  } as never);

  await useAppStore.getState().setProviderEnabled('ollama', false);

  expect(useAppStore.getState().availableProviders).toEqual(['gemini']);
  expect(useAppStore.getState().sessionSettings.selectedProvider).toBe(
    'gemini',
  );
});

test('resets to “Select provider” when adding a provider next to the selected one', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
      {
        provider: 'openrouter',
        displayName: 'OpenRouter',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: false,
      },
    ] as never,
    sessionSettings: { selectedProvider: 'gemini' } as never,
  });
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: [] },
  } as never);

  await useAppStore.getState().setProviderEnabled('openrouter', true);

  // Доступных стало двое — выбор сбрасывается, пользователь выбирает сам.
  expect(useAppStore.getState().sessionSettings.selectedProvider).toBeNull();
});

test('stays neutral when removing one provider while two remain and nothing is selected', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
      {
        provider: 'openrouter',
        displayName: 'OpenRouter',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ] as never,
    sessionSettings: { selectedProvider: null } as never,
  });
  // Ничего не выбрано; бэкенд шлёт selected_provider — но цепочку из
  // нейтрального положения запускать нельзя.
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'], selected_provider: 'gemini' },
  } as never);

  await useAppStore.getState().setProviderEnabled('ollama', false);

  expect(useAppStore.getState().availableProviders).toEqual([
    'gemini',
    'openrouter',
  ]);
  expect(useAppStore.getState().sessionSettings.selectedProvider).toBeNull();
});

test('keeps the current valid selection when disabling a different provider', async () => {
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
      {
        provider: 'openrouter',
        displayName: 'OpenRouter',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ] as never,
    sessionSettings: { selectedProvider: 'gemini' } as never,
  });
  // Выключаем НЕ выбранного (ollama); бэкенд selected_provider не шлёт.
  mockedJobsApi.updateDesktopSettings.mockResolvedValue({
    data: { disabled_providers: ['ollama'] },
  } as never);

  await useAppStore.getState().setProviderEnabled('ollama', false);

  expect(useAppStore.getState().sessionSettings.selectedProvider).toBe(
    'gemini',
  );
});

test('unselects a file from export when it fails', () => {
  useAppStore.setState({
    jobs: [{ ...makeJob('file-1'), selected_for_export: true }],
  });

  useAppStore.getState().updateJobStatus('file-1', 'error', 'provider timeout');

  expect(useAppStore.getState().jobs[0]).toMatchObject({
    status: 'error',
    selected_for_export: false,
  });
});

test('keeps the export selection for files that succeed', () => {
  useAppStore.setState({
    jobs: [{ ...makeJob('file-1'), selected_for_export: true }],
  });

  useAppStore.getState().updateJobStatus('file-1', 'done');

  expect(useAppStore.getState().jobs[0].selected_for_export).toBe(true);
});
