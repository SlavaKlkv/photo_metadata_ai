import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface UIState {
  isSettingsOpen: boolean;
  isFileListOpen: boolean;
  isProcessing: boolean;
  isProgressModalOpen: boolean;
  isUploaded: boolean;
  isExportReady: boolean;
  currentJobId: string | null;
  selectedJobId: string | null;
  isPollingActive: boolean;
  isExporting: boolean;
  
  // Actions
  toggleSettings: () => void;
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
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      // initial state
      isSettingsOpen: false,
      isFileListOpen: true,
      isProcessing: false,
      isProgressModalOpen: false,
      isUploaded: false,
      isExportReady: false,
      currentJobId: null, 
      selectedJobId: null,
      isPollingActive: false,
      isExporting: false,
      
      // actions
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
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
    }),
    { name: 'UIStore' }
  )
);