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

beforeEach(() => {
  useAppStore.setState({
    hasAcceptedOnboarding: false,
    discoverProviders: jest.fn(),
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
