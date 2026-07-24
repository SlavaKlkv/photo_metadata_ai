// frontend/src/constants/pagination.ts
// Размер страницы таблицы Results. Нужен и таблице, и превью:
// превью по индексу выбранного файла вычисляет страницу, на которую
// таблица должна переключиться.
export const RESULTS_PAGE_SIZE = 10;

export const getResultsPageForIndex = (index: number) =>
  index < 0 ? 1 : Math.floor(index / RESULTS_PAGE_SIZE) + 1;
