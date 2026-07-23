import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { AISetupModal } from './AISetupModal';

jest.mock('../AIProviderSetup/AIProviderSetup', () => ({
  AIProviderSetup: () => <div>Provider list</div>,
}));

const readyProvider = {
  provider: 'ollama',
  displayName: 'QWEN 2.5 VL',
  ready: true,
  enabled: true,
} as never;

beforeEach(() => {
  useAppStore.setState({
    hasAcceptedOnboarding: false,
    discoverProviders: jest.fn(),
    providerDiscoveryItems: [readyProvider],
    providerDiscoveryError: null,
  });
  useUIStore.setState({
    isAiSetupOpen: false,
    isProcessing: false,
    isExportReady: false,
    isExporting: false,
  });
});

test.each([
  ['processing', { isProcessing: true }],
  ['review', { isExportReady: true }],
  ['export', { isExporting: true }],
])('is hidden on %s step', (_step, state) => {
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    discoverProviders: jest.fn().mockResolvedValue(undefined),
  });
  useUIStore.setState({ isAiSetupOpen: true, ...state });

  render(<AISetupModal />);
  expect(screen.queryByText('AI Setup')).not.toBeInTheDocument();
});

test('is hidden before onboarding or while closed', () => {
  const { rerender } = render(<AISetupModal />);
  expect(screen.queryByText('AI Setup')).not.toBeInTheDocument();

  act(() => {
    useUIStore.setState({ isAiSetupOpen: true });
  });
  rerender(<AISetupModal />);
  expect(screen.queryByText('AI Setup')).not.toBeInTheDocument();
});

test('refreshes providers on open and closes from Done', async () => {
  const discoverProviders = jest.fn().mockResolvedValue(undefined);
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    discoverProviders,
  });
  useUIStore.setState({ isAiSetupOpen: true });

  render(<AISetupModal />);

  expect(screen.getByText('Provider list')).toBeInTheDocument();
  await waitFor(() => {
    expect(discoverProviders).toHaveBeenCalledWith({ silent: true });
  });

  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(useUIStore.getState().isAiSetupOpen).toBe(false);
});

test('shows a loading state while providers are still empty', () => {
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    discoverProviders: jest.fn().mockResolvedValue(undefined),
    providerDiscoveryItems: [],
    providerDiscoveryError: null,
  });
  useUIStore.setState({ isAiSetupOpen: true });

  render(<AISetupModal />);

  expect(screen.getByText('Checking AI providers…')).toBeInTheDocument();
  expect(screen.queryByText('Provider list')).not.toBeInTheDocument();
  // Пока идёт проверка провайдеров, закрывать нечего — Done не показываем.
  expect(
    screen.queryByRole('button', { name: 'Done' }),
  ).not.toBeInTheDocument();
});

test('shows an error state when discovery failed with no providers', () => {
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    discoverProviders: jest.fn().mockResolvedValue(undefined),
    providerDiscoveryItems: [],
    providerDiscoveryError: 'network down',
  });
  useUIStore.setState({ isAiSetupOpen: true });

  render(<AISetupModal />);

  expect(
    screen.getByText('Couldn’t load AI providers. Reopen to try again.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Checking AI providers…')).not.toBeInTheDocument();
});

test('closes on Escape', async () => {
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    discoverProviders: jest.fn().mockResolvedValue(undefined),
  });
  useUIStore.setState({ isAiSetupOpen: true });

  render(<AISetupModal />);

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(useUIStore.getState().isAiSetupOpen).toBe(false);
});
