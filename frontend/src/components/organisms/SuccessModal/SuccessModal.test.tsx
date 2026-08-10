import { fireEvent, render } from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { SuccessModal } from './SuccessModal';

jest.mock('services/api/api', () => ({
  jobsApi: {
    openExportArtifact: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'a.jpg',
        originalFilename: 'a.jpg',
        status: 'done',
        selected_for_export: true,
      },
    ],
    previews: {},
  });
  useUIStore.setState({
    isSuccessModalOpen: true,
    isExporting: true,
    exportArtifacts: [],
    currentJobId: 'job-1',
  });
});

test('closes on Escape and leaves the export step', () => {
  render(<SuccessModal />);

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(useUIStore.getState().isSuccessModalOpen).toBe(false);
});

test('ignores Escape once the modal is closed', () => {
  useUIStore.setState({ isSuccessModalOpen: false });
  const closeSuccessModal = jest.fn();
  useUIStore.setState({ closeSuccessModal });

  render(<SuccessModal />);
  fireEvent.keyDown(document, { key: 'Escape' });

  expect(closeSuccessModal).not.toHaveBeenCalled();
});

test('ignores unrelated keys', () => {
  render(<SuccessModal />);

  fireEvent.keyDown(document, { key: 'Enter' });

  expect(useUIStore.getState().isSuccessModalOpen).toBe(true);
});
