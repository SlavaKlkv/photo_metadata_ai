//frontend/src/types/index.ts
/**
 * Centralized TypeScript types for the application
 */

export interface ProcessingJob {
  id: string;
  filename: string;
  originalFilename: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  // плоские поля — source of truth от бэкенда
  title?: string;
  description?: string;
  keywords?: string[];
  selected_for_export?: boolean;
  effective_ai_provider?: AIProvider | null;
  effective_ai_model?: string | null;
  field_sources?: Record<string, 'generated' | 'edited'>;
  edited_fields?: string[];
  // stock-specific preview — меняется при смене стока
  preview?: FilePreview;
  // legacy — оставляем для обратной совместимости пока не перейдём полностью
  metadata?: {
    title: string;
    description: string;
    keywords: string[];
  };
}

// TODO: remove 'mock' before production; 'ollama' = QWEN 2.5 VL via Ollama
export type AIProvider = 'mock' | 'ollama' | 'gemini' | 'openrouter';

export const AI_PROVIDER_LABELS: Partial<Record<AIProvider, string>> = {
  ollama: 'QWEN 2.5 VL',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

export type StockPlatform = 'getty_images' | 'shutterstock' | 'adobe_stock';

export interface SessionSettings {
  selectedProvider: AIProvider | null;
}

export interface ProviderDiscoveryItem {
  provider: AIProvider;
  displayName: string;
  ready: boolean;
  status: string;
  source?: 'desktop_storage' | 'environment' | null;
  reason?: string | null;
  reason_code?: string | null;
  hints: string[];
  configured: boolean;
  local: boolean;
  // Провайдер включён пользователем в AI Setup. Выключенный не участвует
  // ни в выборе, ни в fallback-кольце.
  enabled: boolean;
  model?: string | null;
  setup_links?: Array<{ label: string; url: string }>;
  api_key_links?: Array<{ label: string; url: string }>;
}

export interface ProviderDiscoveryResponse {
  providers: ProviderDiscoveryItem[];
  ready_providers: AIProvider[];
  recommended_provider?: AIProvider | null;
  has_ready_provider: boolean;
  hints: string[];
}

export interface AIProviderApiKeyValidationResponse {
  provider: AIProvider;
  valid: boolean;
  status: 'valid' | 'invalid';
  reason_code?: string | null;
  message: string;
  saved: boolean;
}

export interface DesktopHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  runtime_profile: string;
}

export interface DesktopUpdateCheckResponse {
  status: 'ok' | 'unavailable' | 'disabled';
  update_available: boolean;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
  download_url: string | null;
}

export interface DesktopRuntimeInfo {
  runtime_profile: string;
  workspace_dir: string;
  jobs_dir: string;
  results_dir: string;
  temp_dir: string;
  directories_ready: boolean;
}

export interface DesktopStartupStatusResponse {
  status: 'ready' | 'degraded' | 'not_ready';
  phase: 'pending' | 'checking' | 'completed' | 'failed';
  has_ready_provider: boolean;
  message: string;
  attempts: number;
  max_attempts: number;
}

export interface BatchSettings {
  shootingContext: string;
  stockPlatform: StockPlatform;
  aiProvider?: AIProvider;
  exportFormats: {
    csv: boolean;
    iptc: boolean;
  };
}

export interface ApiUploadResponse {
  jobIds: string[];
}

export interface ApiStatusResponse {
  jobs: ProcessingJob[];
}

export interface ApiResultsResponse {
  results: ProcessingJob[];
}

// Поле preview — одна запись (key/label/value)
export type PreviewFieldValue = string | boolean | number | string[] | null;

export interface PreviewField {
  key: string;
  label: string;
  value: PreviewFieldValue;
}

// Ошибка/предупреждение валидации
export interface ValidationMessage {
  field: string;
  code: string;
  message: string;
}

// Preview секция внутри результата файла
export interface FilePreview {
  stock_platform: StockPlatform;
  common_fields: PreviewField[];
  stock_specific: {
    title: string;
    fields: PreviewField[];
  };
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

// Stock options — правила и лимиты выбранного стока
export interface StockOptions {
  stock_platform: StockPlatform;
  platform_type: string;
  categories: string[];
  license_types: string[];
  title_required: boolean;
  title_max_characters: number;
  title_warning_characters: number;
  title_min_words: number;
  description_required: boolean;
  description_max_characters: number;
  keywords_required: boolean;
  keywords_min_count: number;
  keywords_max_count: number;
  keywords_recommended_min: number;
  keywords_recommended_max: number;
  categories_required: boolean;
  multi_category_supported: boolean;
  max_categories: number;
  supports_category_2: boolean;
  license_required: boolean;
  releases_required: boolean;
  editorial_caption_required: boolean;
  editorial_date_required: boolean;
  people_supported: boolean;
  model_release_required_when_people: boolean;
}

export interface ExportArtifact {
  export_format: "csv" | "iptc" | "json";
  filename: string;
  path: string;
  size_bytes: number;
  count: number;
}

// Ответ polling-эндпоинта статуса экспорта. Прогресс в файлах —
// первичен: из processed/total рисуются и счётчик, и полоса
export interface ExportStatusResponse {
  export_status: "queued" | "processing" | "completed" | "failed" | "cancelled" | null;
  export_progress: number;
  export_processed_files: number;
  export_total_files: number;
  export_format?: string | null;
  export_error_message?: string | null;
  export_artifacts?: ExportArtifact[];
}
