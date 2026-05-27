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

export type AIProvider = 'mock' | 'ollama' | 'claude' | 'openai'; //TODO: Update with actual provider names as needed. Mock is for testing purposes and should be removed in production.
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