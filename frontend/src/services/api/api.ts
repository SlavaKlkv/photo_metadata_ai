// frontend/src/services/api/api.ts
import axios, { AxiosInstance } from 'axios';
import type {
  AIProvider,
  AIProviderApiKeyValidationResponse,
  StockPlatform,
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
    },
  ) =>
    apiClient.post(`/api/v1/jobs/${jobId}/export`, null, {
      params: formats,
    }),

  downloadExport: (jobId: string, exportFormat: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export`, {
      params: {
        [exportFormat]: true,
      },
      responseType: "blob",
    }),

  // статус экспорта
  getExportStatus: (jobId: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export/status`),

  // отмена
  cancel: (jobId: string) => apiClient.post(`/api/v1/jobs/${jobId}/cancel`),

  // обновление метаданных файла
  updateMetadata: (jobId: string, fileId: string, metadata: object) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/files/${fileId}/metadata`, metadata),

  updateSelection: (jobId: string, selectedForExport: boolean) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/files/selection`, {
      selected_for_export: selectedForExport,
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
  updateDesktopSettings: (settings: { selected_provider: string }) =>
    apiClient.patch("/api/v1/desktop/settings", settings),

  // результаты с маппингом под конкретный сток
  getResultsByStock: (jobId: string, stockPlatform: StockPlatform) =>
    apiClient.get(`/api/v1/jobs/${jobId}/results`, {
      params: { stock_platform: stockPlatform },
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
