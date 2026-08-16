import { render, screen } from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import App from './App';

jest.mock('./hooks/usePolling', () => ({ usePolling: jest.fn() }));
jest.mock('./hooks/useDesktopAppBusySync', () => ({
  useDesktopAppBusySync: jest.fn(),
}));
jest.mock('./components/organisms/FileUploadSection/FileUploadSection', () => ({
  FileUploadSection: () => null,
}));
jest.mock('./components/organisms/SettingsPanel/SettingsPanel', () => ({
  SettingsPanel: () => null,
}));
jest.mock('./components/organisms/ProgressModal/ProgressModal', () => ({
  ProgressModal: () => null,
}));
jest.mock('./components/organisms/BottomActionBar/BottomActionBar', () => ({
  BottomActionBar: () => null,
}));
jest.mock('./components/organisms/ResultsTable/ResultsTable', () => ({
  ResultsTable: () => null,
}));
jest.mock('./components/organisms/MetadataPreview/MetadataPreview', () => ({
  MetadataPreview: () => null,
}));
jest.mock('./components/organisms/ExportModal/ExportModal', () => ({
  ExportModal: () => null,
}));
jest.mock('./components/organisms/SuccessModal/SuccessModal', () => ({
  SuccessModal: () => null,
}));
jest.mock('./components/organisms/OnboardingModal/OnboardingModal', () => ({
  OnboardingModal: () => null,
}));
jest.mock('./components/organisms/AISetupModal/AISetupModal', () => ({
  AISetupModal: () => null,
}));
jest.mock('./components/organisms/UpdateBanner/UpdateBanner', () => ({
  UpdateBanner: () => null,
}));

beforeEach(() => {
  useAppStore.setState({
    hasAcceptedOnboarding: true,
    loadSessionSettings: jest.fn(),
    discoverProviders: jest.fn().mockResolvedValue(undefined),
    checkForUpdates: jest.fn().mockResolvedValue(undefined),
  });
  useUIStore.setState({
    isProcessing: false,
    isExportReady: false,
    isExporting: false,
  });
});

test('AI Setup button is enabled on Upload/Context steps', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: /AI Setup/ })).toBeEnabled();
});

test.each([
  ['processing', { isProcessing: true }],
  ['review', { isExportReady: true }],
  ['export', { isExporting: true }],
])('AI Setup button is disabled on %s step', (_step, state) => {
  useUIStore.setState(state);
  render(<App />);
  expect(screen.getByRole('button', { name: /AI Setup/ })).toBeDisabled();
});
