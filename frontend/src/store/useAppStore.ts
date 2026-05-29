// frontend/src/store/useAppStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  ProcessingJob,
  SessionSettings,
  BatchSettings,
} from '../types';
import { jobsApi } from '../services/api/api';

const defaultSessionSettings: SessionSettings = {
  aiProvider: 'ollama',
};

const defaultBatchSettings: BatchSettings = {
  shootingContext: '',
  stockPlatform: 'getty_images',
  exportFormats: {
    csv: true,
    iptc: false,
  },
};

export interface AppState {
  jobs: ProcessingJob[];
  sessionSettings: SessionSettings;
  draftBatchSettings: BatchSettings;
  lockedBatchSettings: BatchSettings | null;
  isProcessing: boolean;
  diagnosticCount: number;

  addJobs: (files: ProcessingJob[]) => void;
  updateJobStatus: (
    jobId: string,
    status: ProcessingJob['status'],
    error?: string,
  ) => void;
  updateMetadata: (
    jobId: string,
    metadata: ProcessingJob['metadata'],
  ) => void;
  removeJob: (jobId: string) => void;

  updateSessionSetting: (
    key: keyof SessionSettings,
    value: SessionSettings[keyof SessionSettings],
  ) => void;
  updateDraftBatchSetting: <K extends keyof BatchSettings>(
    key: K,
    value: BatchSettings[K],
  ) => void;
  updateExportFormat: (
    key: keyof BatchSettings['exportFormats'],
    value: boolean,
  ) => void;
  lockBatchSettings: () => void;
  unlockBatchSettings: () => void;
  resetBatchState: () => void;

  setIsProcessing: (isProcessing: boolean) => void;
  inc: () => void;

  getOverallProgress: () => number;
  getFileById: (fileId: string) => ProcessingJob | undefined;
  hasErrors: () => boolean;
  clearAll: () => void;

  previews: Record<string, string>;
  addPreviews: (previews: Record<string, string>) => void;
  clearPreviews: () => void;

  loadSessionSettings: () => void;
  saveSessionSettings: () => void;

  // regenerate одного файла, используя lockedBatchSettings — не дёргает весь batch
  regeneratingFileId: string | null;
  regenerateFile: (
    fileId: string,
    currentJobId: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    jobs: [],
    sessionSettings: defaultSessionSettings,
    draftBatchSettings: defaultBatchSettings,
    lockedBatchSettings: null,
    isProcessing: false,
    diagnosticCount: 0,
    regeneratingFileId: null,

    addJobs: (newJobs: ProcessingJob[]) => {
      set((state) => ({
        jobs: [...state.jobs, ...newJobs],
      }));
    },

    updateJobStatus: (
      jobId: string,
      status: ProcessingJob['status'],
      error?: string,
    ) => {
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId ? { ...job, status, error } : job,
        ),
      }));
    },

    updateMetadata: (
      jobId: string,
      metadata: ProcessingJob['metadata'],
    ) => {
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId ? { ...job, metadata } : job,
        ),
      }));
    },

    removeJob: (jobId: string) => {
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
      }));
    },

    updateSessionSetting: (key, value) => {
      set((state) => ({
        sessionSettings: {
          ...state.sessionSettings,
          [key]: value,
        },
      }));
    },

    updateDraftBatchSetting: (key, value) => {
      set((state) => ({
        draftBatchSettings: {
          ...state.draftBatchSettings,
          [key]: value,
        },
      }));
    },

    updateExportFormat: (key, value) => {
      set((state) => ({
        draftBatchSettings: {
          ...state.draftBatchSettings,
          exportFormats: {
            ...state.draftBatchSettings.exportFormats,
            [key]: value,
          },
        },
      }));
    },

    lockBatchSettings: () => {
      const { draftBatchSettings } = get();
      set({
        lockedBatchSettings: {
          shootingContext: draftBatchSettings.shootingContext,
          stockPlatform: draftBatchSettings.stockPlatform,
          exportFormats: { ...draftBatchSettings.exportFormats },
        },
      });
    },

    unlockBatchSettings: () => {
      set({ lockedBatchSettings: null });
    },

    resetBatchState: () => {
      set({
        draftBatchSettings: defaultBatchSettings,
        lockedBatchSettings: null,
        jobs: [],
        isProcessing: false,
        previews: {},
        regeneratingFileId: null,
      });
    },

    setIsProcessing: (isProcessing: boolean) => {
      set({ isProcessing });
    },

    inc: () => {
      set((state) => ({
        diagnosticCount: state.diagnosticCount + 1,
      }));
    },

    previews: {},
    addPreviews: (newPreviews) =>
      set((state) => ({
        previews: { ...state.previews, ...newPreviews },
      })),
    clearPreviews: () => set({ previews: {} }),

    getOverallProgress: () => {
      const { jobs } = get();
      if (jobs.length === 0) return 0;

      const completedCount = jobs.filter(
        (job) => job.status === 'done' || job.status === 'error',
      ).length;

      return Math.round((completedCount / jobs.length) * 100);
    },

    getFileById: (fileId: string) => {
      const { jobs } = get();
      return jobs.find((job) => job.id === fileId);
    },

    hasErrors: () => {
      const { jobs } = get();
      return jobs.some((job) => job.status === 'error');
    },

    clearAll: () => {
      set({
        jobs: [],
        isProcessing: false,
        previews: {},
      });
    },

    loadSessionSettings: () => {
      try {
        const saved = localStorage.getItem('session_settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          set((state) => ({
            sessionSettings: {
              ...state.sessionSettings,
              ...parsed,
            },
          }));
        }
      } catch (err) {
        console.error('Failed to load session settings:', err);
      }
    },

    saveSessionSettings: () => {
      try {
        const { sessionSettings } = get();
        localStorage.setItem(
          'session_settings',
          JSON.stringify(sessionSettings),
        );
      } catch (err) {
        console.error('Failed to save session settings:', err);
      }
    },

    // Regenerate одного файла используя lockedBatchSettings.
    // lockedBatchSettings гарантирует что используется оригинальный shooting context,
    // а не текущий draft — даже если пользователь его уже поменял.
    regenerateFile: async (fileId, currentJobId) => {
      const { lockedBatchSettings, sessionSettings, updateMetadata } = get();

      // regenerate доступен только после processing — locked settings обязательны
      if (!lockedBatchSettings) {
        return { success: false, error: 'No locked batch settings found' };
      }

      set({ regeneratingFileId: fileId });

      try {
        const response = await jobsApi.regenerateFile(currentJobId, fileId, {
          shooting_context: lockedBatchSettings.shootingContext,
          stock_platform: lockedBatchSettings.stockPlatform,
          ai_provider: sessionSettings.aiProvider,
        });

        const newMetadata = response.data?.metadata;
        if (newMetadata) {
          updateMetadata(fileId, newMetadata);
        }

        return { success: true };
      } catch (err: unknown) {
        // TODO(backend): убрать mock когда появится реальный endpoint
        // Пока endpoint не реализован — логируем и возвращаем ошибку наверх
        console.warn('[regenerateFile] Backend endpoint not yet implemented:', err);
        return {
          success: false,
          error: 'Regenerate is not yet available. Backend endpoint pending.',
        };
      } finally {
        set({ regeneratingFileId: null });
      }
    },
  })),
);