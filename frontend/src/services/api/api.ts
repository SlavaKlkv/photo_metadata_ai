// frontend/src/services/api/api.ts
import axios, { AxiosInstance } from 'axios';

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
    apiClient.post('/api/v1/jobs/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // обновление настроек джоба перед запуском
  updateSettings: (jobId: string, settings: {
    shooting_context?: string;
    stock_platform?: string;
    export_formats?: string[];
    ai_provider?: string;
    export_quality?: number;
  }) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/settings`, settings),

  // запуск обработки
  startProcessing: (jobId: string) =>
    apiClient.post(`/api/v1/jobs/${jobId}/process`),

  // статус джоба (для поллинга)
  getStatus: (jobId: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/status`),

  // результаты после обработки
  getResults: (jobId: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/results`),

  // старт экспорта — новый endpoint
  startExport: (jobId: string, exportFormat: string) =>
    apiClient.post(`/api/v1/jobs/${jobId}/export/${exportFormat}`),

  // скачать экспорт
  downloadExport: (jobId: string, exportFormat: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export/${exportFormat}`, {
      responseType: 'blob',
    }),

  // статус экспорта
  getExportStatus: (jobId: string) =>
    apiClient.get(`/api/v1/jobs/${jobId}/export/status`),

  // отмена
  cancel: (jobId: string) =>
    apiClient.post(`/api/v1/jobs/${jobId}/cancel`),

  // обновление метаданных файла
  updateMetadata: (jobId: string, fileId: string, metadata: object) =>
    apiClient.patch(`/api/v1/jobs/${jobId}/files/${fileId}/metadata`, metadata),

  // TODO(backend): implement POST /api/v1/jobs/:jobId/files/:fileId/regenerate
  // должен принимать { shooting_context, stock_platform, ai_provider } из lockedBatchSettings
  // и возвращать новый metadata объект для одного файла без перезапуска всего batch
  regenerateFile: (jobId: string, fileId: string, settings: {
    shooting_context: string;
    stock_platform: string;
    ai_provider: string;
  }) =>
    apiClient.post(`/api/v1/jobs/${jobId}/files/${fileId}/regenerate`, settings),

  providerDiscovery: () => apiClient.get('/api/v1/desktop/providers/discovery'),
};

export default apiClient;