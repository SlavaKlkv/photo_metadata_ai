jest.mock('axios', () => {
  const client = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => client),
    },
    mockClient: client,
  };
});

import { jobsApi } from './api';

const { mockClient } = jest.requireMock('axios') as {
  mockClient: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('uses expected job processing endpoints', () => {
  jobsApi.updateSettings('job-1', { shooting_context: 'studio' });
  jobsApi.startProcessing('job-1');
  jobsApi.getStatus('job-1');
  jobsApi.cancel('job-1');

  expect(mockClient.patch).toHaveBeenCalledWith(
    '/api/v1/jobs/job-1/settings',
    { shooting_context: 'studio' },
  );
  expect(mockClient.post).toHaveBeenCalledWith(
    '/api/v1/jobs/job-1/process',
  );
  expect(mockClient.get).toHaveBeenCalledWith('/api/v1/jobs/job-1/status');
  expect(mockClient.post).toHaveBeenCalledWith('/api/v1/jobs/job-1/cancel');
});

test('passes export and stock options as query params', () => {
  jobsApi.startExport('job-1', {
    csv: true,
    iptc: false,
    stock_platform: 'adobe_stock',
  });
  jobsApi.getResultsByStock('job-1', 'adobe_stock');
  jobsApi.getStockOptions('adobe_stock');

  expect(mockClient.post).toHaveBeenCalledWith(
    '/api/v1/jobs/job-1/export',
    null,
    {
      params: {
        csv: true,
        iptc: false,
        stock_platform: 'adobe_stock',
      },
    },
  );
  expect(mockClient.get).toHaveBeenCalledWith(
    '/api/v1/jobs/job-1/results',
    { params: { stock_platform: 'adobe_stock' } },
  );
  expect(mockClient.get).toHaveBeenCalledWith(
    '/api/v1/jobs/stock-options/adobe_stock',
  );
});

test('uses safe desktop action endpoints', () => {
  jobsApi.openResultFile('job-1', 'metadata.csv');
  jobsApi.openResultsFolder('job-1');

  expect(mockClient.post).toHaveBeenCalledWith(
    '/api/v1/desktop/jobs/job-1/open-result-file',
    null,
    { params: { filename: 'metadata.csv' } },
  );
  expect(mockClient.post).toHaveBeenCalledWith(
    '/api/v1/desktop/jobs/job-1/open-results-folder',
  );
});

test('uses the desktop update check endpoint', () => {
  jobsApi.checkForUpdates();

  expect(mockClient.get).toHaveBeenCalledWith('/api/v1/desktop/updates');
});
