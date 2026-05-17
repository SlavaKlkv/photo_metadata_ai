import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ProcessingJob, AppSettings } from '../types';

/**
 * App State - полное состояние приложения
 */
export interface AppState {
  // Data
  jobs: ProcessingJob[];
  settings: AppSettings;
  isProcessing: boolean;
  diagnosticCount: number;

  // Actions - File Management
  addJobs: (files: ProcessingJob[]) => void;
  updateJobStatus: (jobId: string, status: ProcessingJob['status'], error?: string) => void;
  updateMetadata: (jobId: string, metadata: ProcessingJob['metadata']) => void;
  removeJob: (jobId: string) => void;
  
  // Actions - Settings
  updateSettings: (key: keyof AppSettings, value: any) => void;
  
  // Actions - UI
  setIsProcessing: (isProcessing: boolean) => void;
  inc: () => void;
  
  // Actions - Utilities
  getOverallProgress: () => number; // 0-100
  getFileById: (fileId: string) => ProcessingJob | undefined;
  hasErrors: () => boolean;
  clearAll: () => void;
  
  // Persistence
  loadSettings: () => void;
  saveSettings: () => void;
}

/**
 * Zustand Store для управления состоянием приложения
 * Интегрирован с Redux DevTools для отладки
 */
export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Initial State
      jobs: [],
      settings: {
        aiProvider: 'ollama',
        shootingContext: '',
        exportFormat: 'getty',
      },
      isProcessing: false,
      diagnosticCount: 0,

      // === File Management Actions ===

      /**
       * Добавить новые файлы в очередь обработки
       */
      addJobs: (newJobs: ProcessingJob[]) => {
        set((state) => ({
          jobs: [...state.jobs, ...newJobs],
        }));
      },

      /**
       * Обновить статус обработки файла
       */
      updateJobStatus: (jobId: string, status: ProcessingJob['status'], error?: string) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId ? { ...job, status, error } : job
          ),
        }));
      },

      /**
       * Обновить метаданные файла
       */
      updateMetadata: (jobId: string, metadata: ProcessingJob['metadata']) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId ? { ...job, metadata } : job
          ),
        }));
      },

      /**
       * Удалить файл из очереди
       */
      removeJob: (jobId: string) => {
        set((state) => ({
          jobs: state.jobs.filter((job) => job.id !== jobId),
        }));
      },

      // === Settings Actions ===

      /**
       * Обновить одну из настроек
       */
      updateSettings: (key: keyof AppSettings, value: any) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));
      },

      // === UI Actions ===

      /**
       * Установить флаг обработки
       */
      setIsProcessing: (isProcessing: boolean) => {
        set({ isProcessing });
      },

      /**
       * Диагностический инкремент для development-only проверки DevTools
       */
      inc: () => {
        set((state) => ({ diagnosticCount: state.diagnosticCount + 1 }));
      },

      // === Computed / Utility Methods ===

      /**
       * Получить общий прогресс обработки (0-100%)
       */
      getOverallProgress: () => {
        const { jobs } = get();
        if (jobs.length === 0) return 0;

        const completedCount = jobs.filter(
          (job) => job.status === 'done' || job.status === 'error'
        ).length;

        return Math.round((completedCount / jobs.length) * 100);
      },

      /**
       * Получить файл по ID
       */
      getFileById: (fileId: string) => {
        const { jobs } = get();
        return jobs.find((job) => job.id === fileId);
      },

      /**
       * Проверить, есть ли файлы с ошибками
       */
      hasErrors: () => {
        const { jobs } = get();
        return jobs.some((job) => job.status === 'error');
      },

      /**
       * Очистить все данные
       */
      clearAll: () => {
        set({
          jobs: [],
          isProcessing: false,
        });
      },

      // === Persistence ===

      /**
       * Загрузить настройки из localStorage
       */
      loadSettings: () => {
        try {
          const saved = localStorage.getItem('app_settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            set((state) => ({
              settings: { ...state.settings, ...parsed },
            }));
          }
        } catch (err) {
          console.error('Failed to load settings from localStorage:', err);
        }
      },

      /**
       * Сохранить настройки в localStorage
       */
      saveSettings: () => {
        try {
          const { settings } = get();
          localStorage.setItem('app_settings', JSON.stringify(settings));
        } catch (err) {
          console.error('Failed to save settings to localStorage:', err);
        }
      },
    }),
)
);
