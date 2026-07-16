//frontend/src/store/useUIStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AIProvider } from 'types';

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
  isPollingActive: boolean;
  isExporting: boolean;
  isExportModalOpen: boolean;
  isSuccessModalOpen: boolean;
  exportArtifacts: ExportArtifact[];
  currentProcessingProvider: AIProvider | null;
  currentProcessingModel: string | null;

  // Actions
  openAiSetup: () => void;
  closeAiSetup: () => void;
  toggleFileList: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
  openProgressModal: () => void;
  closeProgressModal: () => void;
  setIsUploaded: (val: boolean) => void;
  setIsExportReady: (val: boolean) => void;
  setCurrentJobId: (id: string | null) => void;
  setSelectedJobId: (id: string | null) => void;
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
      isPollingActive: false,
      isExporting: false,
      isExportModalOpen: false,
      isSuccessModalOpen: false,
      exportArtifacts: [],
      currentProcessingProvider: null,
      currentProcessingModel: null,
      
      // actions
      openAiSetup: () => set({ isAiSetupOpen: true }),
      closeAiSetup: () => set({ isAiSetupOpen: false }),
      toggleFileList: () =>
        set((state) => ({ isFileListOpen: !state.isFileListOpen })),
      setIsProcessing: (isProcessing) =>
        set({ isProcessing }),
      openProgressModal: () =>
        set({ isProgressModalOpen: true }),
      closeProgressModal: () =>
        set({ isProgressModalOpen: false }),
      setIsUploaded: (val) =>
        set({ isUploaded: val }),
      setIsExportReady: (val) =>
        set({ isExportReady: val }),
      setCurrentJobId: (id) =>
        set({ currentJobId: id }),
      setSelectedJobId: (id) => set({ selectedJobId: id }),
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
