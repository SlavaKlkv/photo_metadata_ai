import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilePreview, ProcessingJob, ValidationMessage } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { jobsApi } from 'services/api/api';
import { ResultsTable } from './ResultsTable';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateSelection: jest.fn(),
    updateMetadata: jest.fn(),
  },
}));

const mockedUpdateSelection = jobsApi.updateSelection as jest.Mock;

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollBy = jest.fn();
});

const error: ValidationMessage = {
  field: 'title',
  code: 'required',
  message: 'Title is required',
};

const warning: ValidationMessage = {
  field: 'keywords',
  code: 'recommended_words_not_met',
  message: 'Add more keywords',
};

const makePreview = (
  errors: ValidationMessage[] = [],
  warnings: ValidationMessage[] = [],
): FilePreview => ({
  stock_platform: 'adobe_stock',
  common_fields: [],
  stock_specific: { title: 'Adobe Stock', fields: [] },
  errors,
  warnings,
});

const makeJob = (
  name: string,
  overrides: Partial<ProcessingJob> = {},
): ProcessingJob => ({
  id: name,
  filename: `${name}.jpg`,
  originalFilename: `${name}.jpg`,
  status: 'done',
  preview: makePreview(),
  selected_for_export: true,
  ...overrides,
});

const jobs: ProcessingJob[] = [
  makeJob('ready-1'),
  makeJob('ready-2'),
  makeJob('warn-1', { preview: makePreview([], [warning]) }),
  makeJob('err-1', { preview: makePreview([error], [warning]) }),
  makeJob('failed-1', { status: 'error', preview: undefined }),
];

beforeEach(() => {
  mockedUpdateSelection.mockReset();
  mockedUpdateSelection.mockResolvedValue({ data: {} });
  useAppStore.setState({
    jobs: jobs.map((job) => ({ ...job })),
    previews: {},
  });
  useUIStore.setState({
    currentJobId: 'job-1',
    selectedJobId: null,
    resultsPage: 1,
    validationFilter: null,
  });
});

const groupButton = (name: string) => screen.getByRole('button', { name });

test('сводка показывает количество файлов в каждой группе', () => {
  render(<ResultsTable />);

  expect(groupButton('Ready (2)')).toBeInTheDocument();
  expect(groupButton('Recommendations (1)')).toBeInTheDocument();
  expect(groupButton('Required fields missing (1)')).toBeInTheDocument();
  expect(groupButton('Processing errors (1)')).toBeInTheDocument();
  expect(groupButton('All (5)')).toBeInTheDocument();
});

test('клик по группе сужает список результатов, сброс возвращает все', async () => {
  render(<ResultsTable />);

  await userEvent.click(groupButton('Required fields missing (1)'));

  expect(screen.getByText('err-1.jpg')).toBeInTheDocument();
  expect(screen.queryByText('ready-1.jpg')).not.toBeInTheDocument();
  expect(screen.getByText('1 of 5 photos')).toBeInTheDocument();

  await userEvent.click(groupButton('All (5)'));

  expect(screen.getByText('ready-1.jpg')).toBeInTheDocument();
  expect(screen.getByText('5 photos')).toBeInTheDocument();
});

test('повторный клик по активной группе возвращает ко всем файлам', async () => {
  render(<ResultsTable />);

  await userEvent.click(groupButton('Ready (2)'));
  expect(screen.queryByText('err-1.jpg')).not.toBeInTheDocument();

  await userEvent.click(groupButton('Ready (2)'));
  expect(screen.getByText('err-1.jpg')).toBeInTheDocument();
});

test('выбранный файл, выпавший из фильтра, остаётся выбранным', async () => {
  useUIStore.setState({ selectedJobId: 'err-1' });
  render(<ResultsTable />);

  await userEvent.click(groupButton('Ready (2)'));

  expect(screen.queryByText('err-1.jpg')).not.toBeInTheDocument();
  expect(useUIStore.getState().selectedJobId).toBe('err-1');
});

test('строка результата показывает маркер своей группы', () => {
  render(<ResultsTable />);

  const readyRow = screen.getByText('ready-1.jpg').closest('div[role="button"]');
  const errorRow = screen.getByText('err-1.jpg').closest('div[role="button"]');
  const failedRow = screen
    .getByText('failed-1.jpg')
    .closest('div[role="button"]');

  // маркер — только цветная точка, чтобы не отнимать место у заголовка;
  // группа читается из подписи для скринридеров и подсказки
  expect(
    within(readyRow as HTMLElement).getByLabelText('Ready'),
  ).toBeInTheDocument();
  expect(
    within(errorRow as HTMLElement).getByLabelText('Error'),
  ).toBeInTheDocument();
  expect(
    within(failedRow as HTMLElement).getByLabelText('Failed'),
  ).toBeInTheDocument();
  expect(within(readyRow as HTMLElement).queryByText('Ready')).toBeNull();
});

test('«Select ready only» оставляет в экспорте только готовые файлы', async () => {
  render(<ResultsTable />);

  await userEvent.click(
    screen.getByRole('button', { name: 'Select ready only (2)' }),
  );

  await waitFor(() => {
    expect(mockedUpdateSelection).toHaveBeenCalledTimes(2);
  });
  expect(mockedUpdateSelection).toHaveBeenNthCalledWith(1, 'job-1', false);
  expect(mockedUpdateSelection).toHaveBeenNthCalledWith(2, 'job-1', true, [
    'ready-1',
    'ready-2',
  ]);

  const selection = Object.fromEntries(
    useAppStore
      .getState()
      .jobs.map((job) => [job.id, job.selected_for_export]),
  );
  expect(selection).toEqual({
    'ready-1': true,
    'ready-2': true,
    'warn-1': false,
    'err-1': false,
    'failed-1': false,
  });
});

test('«Select without errors» оставляет готовые и файлы с рекомендациями', async () => {
  render(<ResultsTable />);

  await userEvent.click(
    screen.getByRole('button', { name: 'Select without errors (3)' }),
  );

  await waitFor(() => {
    expect(mockedUpdateSelection).toHaveBeenCalledTimes(2);
  });
  expect(mockedUpdateSelection).toHaveBeenNthCalledWith(1, 'job-1', false);
  expect(mockedUpdateSelection).toHaveBeenNthCalledWith(2, 'job-1', true, [
    'ready-1',
    'ready-2',
    'warn-1',
  ]);

  const selection = Object.fromEntries(
    useAppStore
      .getState()
      .jobs.map((job) => [job.id, job.selected_for_export]),
  );
  expect(selection).toEqual({
    'ready-1': true,
    'ready-2': true,
    'warn-1': true,
    'err-1': false,
    'failed-1': false,
  });
});

test('без файлов с рекомендациями вторая кнопка не дублирует первую', () => {
  useAppStore.setState({
    jobs: [makeJob('ready-1'), makeJob('err-1', { preview: makePreview([error]) })],
  });
  render(<ResultsTable />);

  expect(screen.getByRole('button', { name: 'Select ready only (1)' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Select without errors/ })).toBeNull();
});

test('ошибка запроса возвращает прежний выбор файлов', async () => {
  mockedUpdateSelection.mockRejectedValue(new Error('network'));
  render(<ResultsTable />);

  await userEvent.click(
    screen.getByRole('button', { name: 'Select ready only (2)' }),
  );

  await waitFor(() => {
    expect(
      useAppStore.getState().jobs.every((job) => job.selected_for_export),
    ).toBe(true);
  });
});

test('«Select ready only» скрыт, когда готовых файлов нет', () => {
  useAppStore.setState({
    jobs: [makeJob('err-1', { preview: makePreview([error]) })],
  });
  render(<ResultsTable />);

  expect(
    screen.queryByRole('button', { name: /Select ready only/ }),
  ).not.toBeInTheDocument();
});

test('при активном фильтре «выбрать все» меняет только видимую группу', async () => {
  useAppStore.setState({
    jobs: jobs.map((job) => ({ ...job, selected_for_export: false })),
  });
  render(<ResultsTable />);

  await userEvent.click(groupButton('Ready (2)'));
  await userEvent.click(screen.getByText('Select all 2 in this group'));

  await waitFor(() => {
    expect(mockedUpdateSelection).toHaveBeenCalledWith('job-1', true, [
      'ready-1',
      'ready-2',
    ]);
  });

  const selection = Object.fromEntries(
    useAppStore
      .getState()
      .jobs.map((job) => [job.id, job.selected_for_export]),
  );
  expect(selection).toEqual({
    'ready-1': true,
    'ready-2': true,
    'warn-1': false,
    'err-1': false,
    'failed-1': false,
  });
});

test('футер считает выбранные по всему батчу, а не по видимой группе', async () => {
  render(<ResultsTable />);

  // без фильтра видно всё: счётчик совпадает с числом файлов
  expect(screen.getByText('5 selected for export')).toBeInTheDocument();

  await userEvent.click(groupButton('Ready (2)'));

  // фильтр сузил список до 2 файлов, но в экспорт по-прежнему уйдут 5
  expect(screen.getByText('5 selected for export')).toBeInTheDocument();
  expect(screen.getByText('2 of 2 in this group')).toBeInTheDocument();
});

test('снятый в группе файл уменьшает общий счётчик экспорта', async () => {
  useAppStore.setState({
    jobs: jobs.map((job) =>
      job.id === 'ready-1' ? { ...job, selected_for_export: false } : job,
    ),
  });
  render(<ResultsTable />);

  await userEvent.click(groupButton('Ready (2)'));

  expect(screen.getByText('4 selected for export')).toBeInTheDocument();
  expect(screen.getByText('1 of 2 in this group')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Select all 2 in this group' }),
  ).toBeInTheDocument();
});

test('сводка не отображается, когда файлов нет', () => {
  useAppStore.setState({ jobs: [] });
  render(<ResultsTable />);

  expect(screen.queryByRole('group', { name: 'Validation summary' })).toBeNull();
});
