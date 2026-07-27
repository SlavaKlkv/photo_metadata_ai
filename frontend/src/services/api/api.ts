// frontend/src/services/api/api.ts
import axios, { AxiosInstance } from 'axios';
import type {
  AIProvider,
  AIProviderApiKeyValidationResponse,
  StockPlatform,
  DesktopHealthResponse,
  DesktopUpdateCheckResponse,
  DesktopRuntimeInfo,
  DesktopStartupStatusResponse,
} from 'types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const jobsApi = {
  // загрузка файлов
  upload: (formData: FormData) =>
    apiClient.post("/api/v1/jobs/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // обновление настроек джоба перед запуском
  updateSettings: (
    jobId: string,
    settings: {
      shooting_context?: string;
      stock_platform?: string;
      export_formats?: string[];
      ai_provider?: string;
      export_quality?: number;
    },
  ) => apiClient.patch(`/api/v1/jobs/${jobId}/settings`, settings),

  // запуск обработки
  startProcessing: (jobId: string) =>
    apiClient.post(`/api/v1/jobs/${jobId}/process`),

  // статус джоба (для поллинга)
  getStatus: (jobId: string) => apiClient.get(`/api/v1/jobs/${jobId}/status`),

  // результаты после обработки
  getResults: (jobId: string) => apiClient.get(`/api/v1/jobs/${jobId}/results`),

  // старт экспорта — новый endpoint
  startExport: (
    jobId: string,
    formats: {
      csv?: boolean;
      iptc?: boolean;
      stock_platform?: StockPlatform;
    },
    signal?: AbortSignal,
  ) =>
    apiClient.post(`/api/v1/jobs/${jobId}/export`, null, {
      params: formats,
      signal,
    }),

  downloadExport: (jobId: string, exportFormat: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export`, {
      params: {
        [exportFormat]: true,
      },
      responseType: "blob",
    }),

  // статус экспорта
  getExportStatus: (jobId: string, signal?: AbortSignal) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export/status`, { signal }),

  // отмена обработки: возвращает задачу в состояние «до старта»
  cancel: (jobId: string) => apiClient.post(`/api/v1/jobs/${jobId}/cancel`),

  // отмена экспорта: останавливает запись файлов, результаты обработки
  // остаются на месте, поэтому экспорт можно запустить повторно
  cancelExport: (jobId: string) =>
    apiClient.post(`/api/v1/jobs/${jobId}/export/cancel`),

  // обновление метаданных файла
  updateMetadata: (jobId: string, fileId: string, metadata: object) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/files/${fileId}/metadata`, metadata),

  // без fileIds выбор меняется у всех файлов задачи,
  // с fileIds — только у перечисленных
  updateSelection: (
    jobId: string,
    selectedForExport: boolean,
    fileIds?: string[],
  ) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/files/selection`, {
      selected_for_export: selectedForExport,
      ...(fileIds ? { file_ids: fileIds } : {}),
    }),

  // регенерация метаданных одного файла без перезапуска всего batch
  regenerateFile: (
    jobId: string,
    fileId: string,
    settings: {
      shooting_context: string;
      stock_platform: string;
      ai_provider: string;
    },
  ) =>
    apiClient.post(
      `/api/v1/jobs/${jobId}/files/${fileId}/regenerate`,
      settings,
    ),

  providerDiscovery: () => apiClient.get("/api/v1/desktop/providers/discovery"),
  validateAndSaveProviderApiKey: (provider: AIProvider, apiKey: string) =>
    apiClient.post<AIProviderApiKeyValidationResponse>(
      `/api/v1/desktop/ai-providers/${provider}/api-key/validate-and-save`,
      { api_key: apiKey },
    ),
  desktopHealth: () =>
    apiClient.get<DesktopHealthResponse>("/api/v1/desktop/health"),

  checkForUpdates: () =>
    apiClient.get<DesktopUpdateCheckResponse>("/api/v1/desktop/updates"),

  desktopRuntimeInfo: () =>
    apiClient.get<DesktopRuntimeInfo>("/api/v1/desktop/runtime"),

  desktopStartupStatus: () =>
    apiClient.get<DesktopStartupStatusResponse>(
      "/api/v1/desktop/startup/status",
    ),
  updateDesktopSettings: (settings: {
    selected_provider?: string;
    disabled_providers?: string[];
  }) => apiClient.patch("/api/v1/desktop/settings", settings),

  // результаты с маппингом под конкретный сток.
  // page/pageSize опциональны: без них backend отдаёт первую страницу
  // (page_size=50), поэтому для пачек крупнее страницы вызывающий код
  // обходит все страницы по pagination.has_next.
  getResultsByStock: (
    jobId: string,
    stockPlatform: StockPlatform,
    page?: number,
    pageSize?: number,
  ) =>
    apiClient.get(`/api/v1/jobs/${jobId}/results`, {
      params: {
        stock_platform: stockPlatform,
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { page_size: pageSize } : {}),
      },
    }),

  // правила и лимиты выбранного стока
  getStockOptions: (stockPlatform: StockPlatform) =>
    apiClient.get(`/api/v1/jobs/stock-options/${stockPlatform}`),

  // desktop actions
  openResultFile: (jobId: string, filename: string) =>
    apiClient.post(`/api/v1/desktop/jobs/${jobId}/open-result-file`, null, {
      params: { filename },
    }),

  openResultsFolder: (jobId: string) =>
    apiClient.post(`/api/v1/desktop/jobs/${jobId}/open-results-folder`),
};

export default apiClient;
