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

export interface AppSettings {
  aiProvider: 'ollama' | 'claude' | 'openai';
  shootingContext: string;
  exportFormat: 'getty' | 'shutterstock' | 'adobe';
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
