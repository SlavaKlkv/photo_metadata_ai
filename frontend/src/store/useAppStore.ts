import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Processing Job - представляет загруженный файл в обработке
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

/**
 * App Settings - глобальные настройки приложения
 */
export interface AppSettings {
  aiProvider: 'ollama' | 'claude' | 'openai';
  shootingContext: string;
  exportFormat: 'getty' | 'shutterstock' | 'adobe';
}

/**
 * App State - полное состояние приложения
 */
export interface AppState {
  // Data
  files: ProcessingJob[];
  settings: AppSettings;
  isProcessing: boolean;
  diagnosticCount: number;

  // Actions - File Management
  addFiles: (files: ProcessingJob[]) => void;
  updateFileStatus: (fileId: string, status: ProcessingJob['status'], error?: string) => void;
  updateMetadata: (fileId: string, metadata: ProcessingJob['metadata']) => void;
  removeFile: (fileId: string) => void;
  
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
      files: [],
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
      addFiles: (newFiles: ProcessingJob[]) => {
        set((state) => ({
          files: [...state.files, ...newFiles],
        }));
      },

      /**
       * Обновить статус обработки файла
       */
      updateFileStatus: (fileId: string, status: ProcessingJob['status'], error?: string) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === fileId ? { ...file, status, error } : file
          ),
        }));
      },

      /**
       * Обновить метаданные файла
       */
      updateMetadata: (fileId: string, metadata: ProcessingJob['metadata']) => {
        set((state) => ({
          files: state.files.map((file) =>
            file.id === fileId ? { ...file, metadata } : file
          ),
        }));
      },

      /**
       * Удалить файл из очереди
       */
      removeFile: (fileId: string) => {
        set((state) => ({
          files: state.files.filter((file) => file.id !== fileId),
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
        const { files } = get();
        if (files.length === 0) return 0;

        const completedCount = files.filter(
          (f) => f.status === 'done' || f.status === 'error'
        ).length;

        return Math.round((completedCount / files.length) * 100);
      },

      /**
       * Получить файл по ID
       */
      getFileById: (fileId: string) => {
        const { files } = get();
        return files.find((f) => f.id === fileId);
      },

      /**
       * Проверить, есть ли файлы с ошибками
       */
      hasErrors: () => {
        const { files } = get();
        return files.some((f) => f.status === 'error');
      },

      /**
       * Очистить все данные
       */
      clearAll: () => {
        set({
          files: [],
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
