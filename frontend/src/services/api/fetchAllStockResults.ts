// frontend/src/services/api/fetchAllStockResults.ts
import { jobsApi } from "services/api/api";
import type { StockPlatform } from "types";

// Максимальный page_size, который принимает бэкенд (le=100).
export const RESULTS_API_PAGE_SIZE = 100;

// Страховка от бесконечного цикла при неожиданном ответе пагинации.
const MAX_PAGES = 1000;

// Собирает результаты со всех страниц: бэкенд отдаёт результаты постранично
// (page_size по умолчанию 50, максимум 100), поэтому для пачек крупнее страницы
// нужен обход всех страниц — иначе файлы за первой страницей остаются
// с preview предыдущей stock-платформы.
//
// Устойчивость к ошибкам: падение на любой странице после первой не отменяет
// уже собранные результаты — возвращаем то, что успели получить. Ошибка на
// самой первой странице пробрасывается вызывающему коду.
export const fetchAllStockResults = async (
  jobId: string,
  stockPlatform: StockPlatform,
): Promise<any[]> => {
  const collected: any[] = [];
  let page = 1;

  for (let guard = 0; guard < MAX_PAGES; guard += 1) {
    let response;

    try {
      response = await jobsApi.getResultsByStock(
        jobId,
        stockPlatform,
        page,
        RESULTS_API_PAGE_SIZE,
      );
    } catch (error) {
      if (page === 1) {
        throw error;
      }

      console.error("[fetchAllStockResults] Page fetch failed:", page, error);
      break;
    }

    collected.push(...(response.data?.results ?? []));

    if (!response.data?.pagination?.has_next) {
      break;
    }

    page += 1;
  }

  return collected;
};
