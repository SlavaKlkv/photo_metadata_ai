import { RESULTS_PAGE_SIZE, getResultsPageForIndex } from './pagination';

test('переводит индекс файла в номер страницы', () => {
  expect(getResultsPageForIndex(0)).toBe(1);
  expect(getResultsPageForIndex(RESULTS_PAGE_SIZE - 1)).toBe(1);
  expect(getResultsPageForIndex(RESULTS_PAGE_SIZE)).toBe(2);
  expect(getResultsPageForIndex(RESULTS_PAGE_SIZE * 2)).toBe(3);
});

test('для отсутствующего файла возвращает первую страницу', () => {
  expect(getResultsPageForIndex(-1)).toBe(1);
});
