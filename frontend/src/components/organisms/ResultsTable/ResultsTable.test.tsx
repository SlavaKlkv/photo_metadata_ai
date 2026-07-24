import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessingJob } from 'types';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
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
  }));

const setJobs = (count: number) => {
  useAppStore.setState({ jobs: makeJobs(count), previews: {} });
  useUIStore.setState({
    currentJobId: 'job-1',
    selectedJobId: null,
    resultsPage: 1,
  });
};

test('на первой странице показывает первые десять файлов', () => {
  setJobs(25);
  render(<ResultsTable />);

  expect(screen.getByText('photo-1.jpg')).toBeInTheDocument();
  expect(screen.getByText('photo-10.jpg')).toBeInTheDocument();
  expect(screen.queryByText('photo-11.jpg')).not.toBeInTheDocument();
});

test('клик по номеру страницы показывает соответствующие строки', async () => {
  setJobs(25);
  render(<ResultsTable />);

  await userEvent.click(screen.getByRole('button', { name: '3' }));

  expect(screen.getByText('photo-21.jpg')).toBeInTheDocument();
  expect(screen.getByText('photo-25.jpg')).toBeInTheDocument();
  expect(screen.queryByText('photo-20.jpg')).not.toBeInTheDocument();
});

test('не оставляет пустую страницу, если список задач сократился', async () => {
  setJobs(25);
  render(<ResultsTable />);

  await userEvent.click(screen.getByRole('button', { name: '3' }));
  expect(screen.getByText('photo-21.jpg')).toBeInTheDocument();

  // новый батч меньше прежнего — третьей страницы больше нет
  act(() => {
    useAppStore.setState({ jobs: makeJobs(5) });
  });

  expect(screen.getByText('photo-1.jpg')).toBeInTheDocument();
  expect(screen.getByText('photo-5.jpg')).toBeInTheDocument();
});

test('показывает страницу, выставленную в store', () => {
  setJobs(25);
  useUIStore.setState({ resultsPage: 2 });
  render(<ResultsTable />);

  expect(screen.getByText('photo-11.jpg')).toBeInTheDocument();
  expect(screen.queryByText('photo-1.jpg')).not.toBeInTheDocument();
});

test('смена страницы пагинацией не меняет выбранное фото', async () => {
  setJobs(25);
  useUIStore.setState({ selectedJobId: 'file-3' });
  render(<ResultsTable />);

  await userEvent.click(screen.getByRole('button', { name: '2' }));

  expect(useUIStore.getState().selectedJobId).toBe('file-3');
  expect(screen.getByText('photo-11.jpg')).toBeInTheDocument();
});

test('клик по строке выбирает фото и не сбрасывает страницу', async () => {
  setJobs(25);
  render(<ResultsTable />);

  await userEvent.click(screen.getByRole('button', { name: '3' }));
  await userEvent.click(screen.getByText('photo-22.jpg'));

  expect(useUIStore.getState().selectedJobId).toBe('file-22');
  expect(useUIStore.getState().resultsPage).toBe(3);
  expect(screen.getByText('photo-21.jpg')).toBeInTheDocument();
});
