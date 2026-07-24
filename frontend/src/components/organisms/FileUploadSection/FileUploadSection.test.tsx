import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import apiClient from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { FileUploadSection } from './FileUploadSection';

jest.mock('services/api/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

// Миниатюры используют canvas/Image, которых нет в jsdom — обходим стороной.
jest.mock('utils/imagePreview', () => ({
  createThumbnails: jest.fn().mockResolvedValue(undefined),
}));

const mockedPost = apiClient.post as jest.Mock;

const jpeg = (name: string) =>
  new File(['x'], name, { type: 'image/jpeg' });

const fileInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"]')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPost.mockResolvedValue({
    data: { job_id: 'job-1', files: [{ file_id: 'f-1' }] },
  });

  useAppStore.setState({ jobs: [], previews: {} });
  useUIStore.setState({
    isUploaded: false,
    isProcessing: false,
    isExportReady: false,
    currentJobId: null,
  });

  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn(() => 'blob:x');
    global.URL.revokeObjectURL = jest.fn();
  }
});

test('resets the input value after a selection so an identical reselection can fire again', async () => {
  render(<FileUploadSection />);
  const input = fileInput();

  await userEvent.upload(input, jpeg('photo.jpg'));

  await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
  // Без сброса браузер не диспатчит повторный change для того же набора файлов
  // (например Cmd+A в той же папке) — и загрузка молча не происходит.
  expect(input.value).toBe('');
});

test('resets the input value before opening the dialog', async () => {
  render(<FileUploadSection />);
  const input = fileInput();

  // Имитируем «застрявшее» значение от предыдущей неудачной попытки.
  Object.defineProperty(input, 'value', {
    configurable: true,
    writable: true,
    value: 'C:\\fakepath\\stuck.jpg',
  });
  const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

  await userEvent.click(screen.getByText(/drag & drop photos here/i));

  expect(input.value).toBe('');
  expect(clickSpy).toHaveBeenCalled();
});
