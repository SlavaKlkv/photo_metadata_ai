import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessingJob } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { getResultsPageForIndex } from 'constants/pagination';
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
    resultsPage: 1,
  });
});

const makeJob = (index: number, status: ProcessingJob['status'] = 'done') =>
  ({
    id: `file-${index}`,
    filename: `photo-${index}.jpg`,
    originalFilename: `photo-${index}.jpg`,
    status,
    preview: {
      stock_platform: 'getty_images',
      common_fields: [
        { key: 'title', label: 'Title', value: `Title ${index}` },
      ],
      stock_specific: { title: 'Getty Images', fields: [] },
      errors: [],
      warnings: [],
    },
  }) as ProcessingJob;

const setJobs = (jobs: ProcessingJob[], selectedJobId: string | null) => {
  useAppStore.setState({ jobs });
  useUIStore.setState({ selectedJobId });
};

const makeJobs = (count: number) =>
  Array.from({ length: count }, (_, i) => makeJob(i + 1));

const clickNav = (label: '‹' | '›') =>
  userEvent.click(screen.getByRole('button', { name: label }));

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

test('стрелка вперёд за границу страницы переключает страницу таблицы', async () => {
  setJobs(makeJobs(25), 'file-10');
  render(<MetadataPreview />);

  await clickNav('›');

  expect(useUIStore.getState().selectedJobId).toBe('file-11');
  expect(useUIStore.getState().resultsPage).toBe(2);
});

test('стрелка назад за границу страницы переключает страницу таблицы', async () => {
  setJobs(makeJobs(25), 'file-11');
  useUIStore.setState({ resultsPage: 2 });
  render(<MetadataPreview />);

  await clickNav('‹');

  expect(useUIStore.getState().selectedJobId).toBe('file-10');
  expect(useUIStore.getState().resultsPage).toBe(1);
});

test('шаг внутри страницы её не меняет', async () => {
  setJobs(makeJobs(25), 'file-3');
  render(<MetadataPreview />);

  await clickNav('›');

  expect(useUIStore.getState().selectedJobId).toBe('file-4');
  expect(useUIStore.getState().resultsPage).toBe(1);
});

test('страница считается по всему списку jobs, а не только по done', async () => {
  // file-5 упал: в doneJobs он отсутствует, но место в таблице занимает
  const jobs = makeJobs(25).map((job, i) =>
    i === 4 ? { ...job, status: 'error' as const } : job,
  );
  setJobs(jobs, 'file-10');
  render(<MetadataPreview />);

  await clickNav('›');

  expect(useUIStore.getState().selectedJobId).toBe('file-11');
  expect(useUIStore.getState().resultsPage).toBe(2);
});

test('переход по номеру открывает страницу с этим файлом', async () => {
  setJobs(makeJobs(25), 'file-1');
  render(<MetadataPreview />);

  await userEvent.click(screen.getByText('1 of 25'));
  const indexInput = screen.getByDisplayValue('1');
  await userEvent.clear(indexInput);
  await userEvent.type(indexInput, '15{Enter}');

  expect(useUIStore.getState().selectedJobId).toBe('file-15');
  expect(useUIStore.getState().resultsPage).toBe(2);
});

test('счётчик остаётся сквозным по всем done-файлам', async () => {
  setJobs(makeJobs(25), 'file-11');
  useUIStore.setState({ resultsPage: 2 });
  render(<MetadataPreview />);

  expect(screen.getByText('11 of 25')).toBeInTheDocument();
});

test('стрелки на границах листают по кругу', async () => {
  setJobs(makeJobs(12), 'file-1');
  render(<MetadataPreview />);

  await clickNav('‹');
  expect(useUIStore.getState().selectedJobId).toBe('file-12');
  expect(useUIStore.getState().resultsPage).toBe(getResultsPageForIndex(11));

  act(() => {
    useUIStore.setState({ selectedJobId: 'file-12', resultsPage: 2 });
  });
  await clickNav('›');
  expect(useUIStore.getState().selectedJobId).toBe('file-1');
  expect(useUIStore.getState().resultsPage).toBe(1);
});

test('исчезновение выбранного файла возвращает выбор и страницу к первому', async () => {
  setJobs(makeJobs(25), 'file-21');
  useUIStore.setState({ resultsPage: 3 });
  render(<MetadataPreview />);

  // новый батч короче: выбранного файла больше нет
  act(() => {
    useAppStore.setState({ jobs: makeJobs(5) });
  });

  await waitFor(() => {
    expect(useUIStore.getState().selectedJobId).toBe('file-1');
  });
  expect(useUIStore.getState().resultsPage).toBe(1);
});

test('renders preview image inside the fixed placeholder container', async () => {
  useAppStore.setState({
    jobs: [
      {
        id: 'file-1',
        filename: 'very-wide-photo-with-a-long-name.jpg',
        originalFilename: 'very-wide-photo-with-a-long-name.jpg',
        status: 'done',
        preview: {
          stock_platform: 'getty_images',
          common_fields: [
            { key: 'title', label: 'Title', value: 'Generated title' },
          ],
          stock_specific: { title: 'Getty Images', fields: [] },
          errors: [],
          warnings: [],
        },
      },
    ],
    previews: { 'file-1': 'blob:preview-url' },
  });

  render(<MetadataPreview />);

  const img = await screen.findByAltText(
    'very-wide-photo-with-a-long-name.jpg',
  );
  expect(img).toHaveAttribute('src', 'blob:preview-url');
  // Контейнер-заглушка держит габариты — картинка вписана внутрь.
  expect(img.className).toContain('previewImage');
  expect(img.parentElement?.className).toContain('imageInner');
  expect(img.parentElement?.parentElement?.className).toContain(
    'imagePlaceholder',
  );
  expect(
    screen.getByTitle('very-wide-photo-with-a-long-name.jpg'),
  ).toHaveClass('filename');
});

const WARNING_MESSAGE = 'Title is shorter than recommended (5+ words).';

const makeJobWithTitleWarning = () =>
  ({
    id: 'file-1',
    filename: 'photo.jpg',
    originalFilename: 'photo.jpg',
    status: 'done',
    preview: {
      stock_platform: 'adobe_stock',
      common_fields: [
        { key: 'title', label: 'Title', value: 'Sunset Over Mountain Range' },
      ],
      stock_specific: { title: 'Adobe Stock', fields: [] },
      errors: [],
      warnings: [
        {
          field: 'title',
          code: 'recommended_words_not_met',
          message: WARNING_MESSAGE,
        },
      ],
    },
  }) as unknown as ProcessingJob;

test('лишний пробел в title не снимает предупреждение', async () => {
  useAppStore.setState({ jobs: [makeJobWithTitleWarning()] });
  render(<MetadataPreview />);

  const input = await screen.findByDisplayValue('Sunset Over Mountain Range');
  await userEvent.type(input, ' ');

  expect(screen.getByText(WARNING_MESSAGE)).toBeInTheDocument();
  expect(
    screen.queryByText(/Validation is outdated/),
  ).not.toBeInTheDocument();
});

test('несохранённая правка не скрывает предупреждение, а помечает его устаревшим', async () => {
  useAppStore.setState({ jobs: [makeJobWithTitleWarning()] });
  render(<MetadataPreview />);

  const input = await screen.findByDisplayValue('Sunset Over Mountain Range');
  await userEvent.type(input, ' Landscape');

  expect(screen.getByText(WARNING_MESSAGE)).toBeInTheDocument();
  expect(screen.getByText(/Validation is outdated/)).toBeInTheDocument();
});
