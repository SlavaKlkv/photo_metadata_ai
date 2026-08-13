import fs from 'fs';
import path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import apiClient from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useToastStore } from 'store/useToastStore';
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

// Файл заданного размера без реального выделения памяти под содержимое.
const jpegOfSize = (name: string, sizeBytes: number) => {
  const file = jpeg(name);
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
};

const fileInput = () =>
  document.querySelector<HTMLInputElement>('input[type="file"]')!;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPost.mockResolvedValue({
    data: { job_id: 'job-1', files: [{ file_id: 'f-1' }] },
  });

  useAppStore.setState({ jobs: [], previews: {} });
  useToastStore.setState({ toasts: [] });
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

// Регрессия: фронт отклонял файлы больше 10 МБ, хотя бэкенд принимает до 50 МБ
// (MAX_UPLOAD_FILE_SIZE_MB в backend/app/core/config.py).
test('accepts files up to the 50MB backend limit', async () => {
  render(<FileUploadSection />);

  await userEvent.upload(
    fileInput(),
    jpegOfSize('big.jpg', 50 * 1024 * 1024),
  );

  await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
});

test('rejects files larger than 50MB', async () => {
  render(<FileUploadSection />);

  await userEvent.upload(
    fileInput(),
    jpegOfSize('huge.jpg', 50 * 1024 * 1024 + 1),
  );

  // Контейнер тостов здесь не рендерится — проверяем через стор.
  await waitFor(() =>
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => /skipped/i.test(toast.message)),
    ).toBe(true),
  );
  expect(mockedPost).not.toHaveBeenCalled();
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

// Регрессия: карточки всегда четырьмя в ряд на всю ширину — ни 2×2, ни пустот
// по краям и между колонками. Перестраивается сама карточка (см. InfoCard),
// а не сетка, поэтому у сетки нет промежуточных состояний.
test('info cards always fill the row in four columns', () => {
  const scss = fs.readFileSync(
    path.join(__dirname, 'FileUploadSection.module.scss'),
    'utf8',
  );

  const grid = scss.match(/\.cardsGrid\s*\{([^}]*)\}/);
  expect(grid).not.toBeNull();
  const base = grid![1];

  expect(base).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  expect(base).toMatch(/gap:\s*16px/);
  expect(base).toMatch(/width:\s*100%/);
  // Ни фиксированных колонок, ни раскладки в два ряда.
  expect(base).not.toMatch(/repeat\(2,/);
  expect(base).not.toMatch(/justify-content/);
  // Растягиваться ряд перестаёт только там, где карточка стала бы низкой
  // и длинной, — дальше он центрируется.
  expect(base).toMatch(/max-width:\s*calc\(4 \* 340px \+ 3 \* 16px\)/);
  expect(base).toMatch(/margin-inline:\s*auto/);

  // Единственная правка сетки — плотный ряд, когда остались только иконки.
  expect(scss).toMatch(
    /@container upload \(max-width: 527px\)\s*\{\s*\.cardsGrid\s*\{\s*gap:\s*8px/,
  );
  expect(scss).not.toMatch(/@container upload \(min-width/);
});
