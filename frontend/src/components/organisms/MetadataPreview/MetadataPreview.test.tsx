import { render, screen, waitFor } from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { MetadataPreview } from './MetadataPreview';

beforeEach(() => {
  useAppStore.setState({
    jobs: [],
    previews: {},
    stockOptions: null,
    lockedBatchSettings: null,
    regeneratingFileId: null,
    isProcessing: false,
  });
  useUIStore.setState({
    selectedJobId: null,
    currentJobId: null,
  });
});

test('shows empty state without a selected completed photo', () => {
  render(<MetadataPreview />);

  expect(
    screen.getByText('Select a photo to preview metadata'),
  ).toBeInTheDocument();
});

test('selects first completed photo and renders preview fields', async () => {
  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'photo.jpg',
        originalFilename: 'photo.jpg',
        status: 'done',
        preview: {
          stock_platform: 'getty_images',
          common_fields: [
            { key: 'title', label: 'Title', value: 'Generated title' },
          ],
          stock_specific: {
            title: 'Getty Images',
            fields: [
              {
                key: 'license_type',
                label: 'License Type',
                value: 'creative',
              },
            ],
          },
          errors: [],
          warnings: [],
        },
      },
    ],
  });

  render(<MetadataPreview />);

  await waitFor(() => {
    expect(useUIStore.getState().selectedJobId).toBe('file-1');
  });
  await waitFor(() => {
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });
  expect(screen.getByDisplayValue('Generated title')).toBeInTheDocument();
  expect(screen.getByDisplayValue('creative')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Regenerate$/ }),
  ).toBeDisabled();
});
