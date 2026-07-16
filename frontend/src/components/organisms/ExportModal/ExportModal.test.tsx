import { act, render, screen, waitFor } from '@testing-library/react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { ExportModal } from './ExportModal';

jest.mock('services/api/api', () => ({
  jobsApi: {
    startExport: jest.fn(),
    getExportStatus: jest.fn(),
  },
}));

const mockedJobsApi = jobsApi as jest.Mocked<typeof jobsApi>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
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
    expect(mockedJobsApi.getExportStatus).toHaveBeenCalledWith('job-1');
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
