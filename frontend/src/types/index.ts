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
  aiProvider: AIProvider;
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