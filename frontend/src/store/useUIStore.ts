//frontend/src/store/useUIStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AIProvider } from 'types';
import type { ValidationGroup } from 'utils/validationGroups';

export interface ExportArtifact {
  export_format: "csv" | "iptc" | "json";
  filename: string;
  path: string;
  size_bytes: number;
  count: number;
}

export interface UIState {
  isAiSetupOpen: boolean;
  isFileListOpen: boolean;
  isProcessing: boolean;
  isProgressModalOpen: boolean;
  isUploaded: boolean;
  isExportReady: boolean;
  currentJobId: string | null;
  selectedJobId: string | null;
  // активная группа валидации в сводке; null — показываем все файлы
  validationFilter: ValidationGroup | null;
  // страница таблицы Results — общая для таблицы и навигации в превью
  resultsPage: number;
  isPollingActive: boolean;
  isExporting: boolean;
  isExportModalOpen: boolean;
  isSuccessModalOpen: boolean;
  exportArtifacts: ExportArtifact[];
  currentProcessingProvider: AIProvider | null;
  currentProcessingModel: string | null;
  // Файлы текущего прогона: null — обрабатывается весь батч, массив id —
  // частичный прогон (повтор упавших). По нему считается прогресс, иначе
  // счётчик стартовал бы с уже готовых файлов предыдущего прогона.
  processingScopeIds: string[] | null;

  // Actions
  openAiSetup: () => void;
  closeAiSetup: () => void;
  toggleFileList: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
  resetProcessingState: () => void;
  finishPartialRun: () => void;
  openProgressModal: (scopeIds?: string[] | null) => void;
  closeProgressModal: () => void;
  setIsUploaded: (val: boolean) => void;
  setIsExportReady: (val: boolean) => void;
  setCurrentJobId: (id: string | null) => void;
  setSelectedJobId: (id: string | null) => void;
  setValidationFilter: (group: ValidationGroup | null) => void;
  setResultsPage: (page: number) => void;
  setIsPollingActive: (val: boolean) => void;
  setIsExporting: (val: boolean) => void;
  openExportModal: () => void;
  closeExportModal: () => void;
  openSuccessModal: () => void;
  closeSuccessModal: () => void;
  setExportArtifacts: (artifacts: ExportArtifact[]) => void;
  setCurrentProcessingProvider: (
    provider: AIProvider | null,
    model?: string | null,
  ) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      // initial state
      isAiSetupOpen: false,
      isFileListOpen: true,
      isProcessing: false,
      isProgressModalOpen: false,
      isUploaded: false,
      isExportReady: false,
      currentJobId: null, 
      selectedJobId: null,
      validationFilter: null,
      resultsPage: 1,
      isPollingActive: false,
      isExporting: false,
      isExportModalOpen: false,
      isSuccessModalOpen: false,
      exportArtifacts: [],
      currentProcessingProvider: null,
      currentProcessingModel: null,
      processingScopeIds: null,

      // actions
      openAiSetup: () => set({ isAiSetupOpen: true }),
      closeAiSetup: () => set({ isAiSetupOpen: false }),
      toggleFileList: () =>
        set((state) => ({ isFileListOpen: !state.isFileListOpen })),
      setIsProcessing: (isProcessing) =>
        set({ isProcessing }),
      // Снимает все флаги прогона после отмены.
      // currentJobId сохраняем: backend вернул ту же задачу в queued,
      // повторный запуск идёт по тому же id.
      resetProcessingState: () =>
        set({
          isProcessing: false,
          isPollingActive: false,
          isProgressModalOpen: false,
          isExportReady: false,
          validationFilter: null,
          currentProcessingProvider: null,
          currentProcessingModel: null,
        }),
      // Завершение частичного прогона (повтор упавших) снимает только флаги
      // обработки. isExportReady трогать нельзя: по нему рендерится экран
      // Review, и его сброс выбрасывал пользователя обратно на Upload, хотя
      // результаты батча никуда не делись.
      finishPartialRun: () =>
        set({
          isProcessing: false,
          isPollingActive: false,
          isProgressModalOpen: false,
          currentProcessingProvider: null,
          currentProcessingModel: null,
        }),
      // Область прогона переживает его завершение и отмену: ответ опроса,
      // отправленный до остановки, приходит уже после сброса флагов, и по
      // обнулённой области его приняли бы за отмену всего батча — с потерей
      // результатов. Область задаётся заново при старте следующего прогона.
      // Без аргумента прогон считается полным: прогресс идёт по всему батчу.
      openProgressModal: (scopeIds = null) =>
        set({ isProgressModalOpen: true, processingScopeIds: scopeIds }),
      closeProgressModal: () =>
        set({ isProgressModalOpen: false }),
      setIsUploaded: (val) =>
        set({ isUploaded: val }),
      setIsExportReady: (val) =>
        set({ isExportReady: val }),
      setCurrentJobId: (id) =>
        set({ currentJobId: id }),
      setSelectedJobId: (id) => set({ selectedJobId: id }),
      // смена фильтра всегда возвращает на первую страницу:
      // прежний номер относился к другому набору файлов
      setValidationFilter: (group) =>
        set({ validationFilter: group, resultsPage: 1 }),
      // страница нумеруется с 1; ниже единицы не опускаемся
      setResultsPage: (page) => set({ resultsPage: Math.max(1, page) }),
      setIsPollingActive: (val) => set({ isPollingActive: val }),
      setIsExporting: (val) => set({ isExporting: val }),
      openExportModal: () => set({ isExportModalOpen: true }),
      closeExportModal: () => set({ isExportModalOpen: false }),
      openSuccessModal: () => set({ isSuccessModalOpen: true }),
      closeSuccessModal: () => set({ isSuccessModalOpen: false }),
      setExportArtifacts: (artifacts) => set({ exportArtifacts: artifacts }),
      setCurrentProcessingProvider: (provider, model = null) =>
        set({
          currentProcessingProvider: provider,
          currentProcessingModel: model,
        }),
    }),
    { name: 'UIStore' }
  )
);
