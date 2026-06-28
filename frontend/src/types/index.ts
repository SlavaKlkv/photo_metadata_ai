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

export type StockPlatform = 'getty_images' | 'shutterstock' | 'adobe_stock';

export interface SessionSettings {
  selectedProvider: AIProvider | null;
}

export interface ProviderDiscoveryItem {
  provider: AIProvider;
  displayName: string;
  ready: boolean;
  status: string;
  reason?: string | null;
  reason_code?: string | null;
  hints: string[];
  configured: boolean;
  local: boolean;
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
export interface PreviewField {
  key: string;
  label: string;
  value: string;
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