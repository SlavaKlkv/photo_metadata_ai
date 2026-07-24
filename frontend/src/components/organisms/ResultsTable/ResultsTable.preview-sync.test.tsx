import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessingJob } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { MetadataPreview } from '../MetadataPreview/MetadataPreview';
import { ResultsTable } from './ResultsTable';

jest.mock('services/api/api', () => ({
  jobsApi: {
    updateSelection: jest.fn(),
    updateMetadata: jest.fn(),
  },
}));

// jsdom не считает layout — лента пагинации полагается на эти методы
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.scrollBy = jest.fn();
});

const makeJobs = (count: number): ProcessingJob[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `file-${i + 1}`,
    filename: `photo-${i + 1}.jpg`,
    originalFilename: `photo-${i + 1}.jpg`,
    status: 'done' as const,
    preview: {
      stock_platform: 'getty_images',
      common_fields: [],
      stock_specific: { title: 'Getty Images', fields: [] },
      errors: [],
      warnings: [],
    },
  }));

beforeEach(() => {
  useAppStore.setState({
    jobs: makeJobs(25),
    previews: {},
    stockOptions: null,
    lockedBatchSettings: null,
    regeneratingFileId: null,
    isProcessing: false,
  });
  useUIStore.setState({
    currentJobId: 'job-1',
    selectedJobId: 'file-10',
    resultsPage: 1,
  });
});

const renderBoth = () =>
  render(
    <>
      <ResultsTable />
      <MetadataPreview />
    </>,
  );

test('стрелка превью переводит таблицу на страницу выбранного фото', async () => {
  renderBoth();
  expect(screen.getByText('photo-1.jpg')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: '›' }));

  // строка выбранного фото теперь на экране, прежняя страница скрыта
  // (имя встречается дважды: строка таблицы и заголовок превью)
  expect(screen.getAllByText('photo-11.jpg')).toHaveLength(2);
  expect(screen.queryByText('photo-1.jpg')).not.toBeInTheDocument();
  expect(screen.getByText('11 of 25')).toBeInTheDocument();
});

test('ручная смена страницы не меняет фото в превью', async () => {
  renderBoth();

  await userEvent.click(screen.getByRole('button', { name: '3' }));

  expect(screen.getByText('photo-21.jpg')).toBeInTheDocument();
  // превью осталось на прежнем фото
  expect(screen.getByText('10 of 25')).toBeInTheDocument();
  expect(useUIStore.getState().selectedJobId).toBe('file-10');
});
