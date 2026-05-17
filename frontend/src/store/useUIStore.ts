import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

//TODO: добавить больше UI-состояний, например, для управления модальными окнами, спиннерами загрузки и т.д. Сейчас в UIStore только базовые состояния для демонстрации.

export interface UIState {
  isSettingsOpen: boolean;
  isFileListOpen: boolean;
  isProcessing: boolean;
  isProgressModalOpen: boolean;
  isUploaded: boolean;
  isExportReady: boolean;
  setIsUploaded: (val: boolean) => void;
  setIsExportReady: (val: boolean) => void;

  // Actions
  toggleSettings: () => void;
  toggleFileList: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
  openProgressModal: () => void;
  closeProgressModal: () => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      isSettingsOpen: false,
      isFileListOpen: true,
      isProcessing: false,
      isProgressModalOpen: false,
      isUploaded: false,
      isExportReady: false,

      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleFileList: () =>
        set((state) => ({ isFileListOpen: !state.isFileListOpen })),
      setIsProcessing: (isProcessing: boolean) =>
        set({ isProcessing }),
      setIsUploaded: (val: boolean) =>
        set({ isUploaded: val }),
      setIsExportReady: (val: boolean) =>
        set({ isExportReady: val }),
      openProgressModal: () =>
        set({ isProgressModalOpen: true }),
      closeProgressModal: () =>
        set({ isProgressModalOpen: false }),
    }),
    { name: 'UIStore' }
  )
);