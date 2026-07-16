import { fireEvent, render, screen } from '@testing-library/react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { SettingsPanel } from './SettingsPanel';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateDesktopSettings: jest.fn().mockResolvedValue({}),
  },
}));

beforeEach(() => {
  useAppStore.setState({
    sessionSettings: { selectedProvider: null },
    availableProviders: [],
    providerDiscoveryItems: [],
    providerDiscoveryStatus: 'ready',
    providerDiscoveryError: null,
    draftBatchSettings: {
      shootingContext: '',
      stockPlatform: 'getty_images',
      exportFormats: { csv: true, iptc: false },
    },
    lockedBatchSettings: null,
  });
  useUIStore.setState({
    currentJobId: null,
    isExportReady: false,
  });
  jest.clearAllMocks();
  (
    jobsApi.updateDesktopSettings as jest.MockedFunction<
      typeof jobsApi.updateDesktopSettings
    >
  ).mockResolvedValue({} as never);
});

test('shows AI Setup guidance when no provider is available', () => {
  render(<SettingsPanel />);

  expect(
    screen.getByText(/No AI providers were detected/),
  ).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Describe the context/)).toHaveValue('');
  expect(screen.getByRole('checkbox', { name: /CSV$/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'IPTC' })).not.toBeChecked();
});

test('updates provider and stock settings from controls', () => {
  useAppStore.setState({
    availableProviders: ['gemini'],
    providerDiscoveryStatus: 'ready',
  });
  render(<SettingsPanel />);
  const [providerSelect, stockSelect] = screen.getAllByRole('combobox');

  fireEvent.change(providerSelect, {
    target: { value: 'gemini' },
  });
  fireEvent.change(stockSelect, {
    target: { value: 'adobe_stock' },
  });

  expect(useAppStore.getState()).toMatchObject({
    sessionSettings: { selectedProvider: 'gemini' },
    draftBatchSettings: {
      stockPlatform: 'adobe_stock',
      aiProvider: 'gemini',
    },
  });
  expect(jobsApi.updateDesktopSettings).toHaveBeenCalledWith({
    selected_provider: 'gemini',
  });
});
