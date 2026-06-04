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