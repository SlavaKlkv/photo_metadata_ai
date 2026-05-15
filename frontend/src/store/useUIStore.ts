import { create } from 'zustand';
import { devtools } from 'zustand/middleware';


//TODO: возможно, стоит объединить UIStore и AppStore в один глобальный Store, так как они тесно связаны. Но для чистоты архитектуры пока оставим их раздельными.

//TODO: добавить больше UI-состояний, например, для управления модальными окнами, спиннерами загрузки и т.д. Сейчас в UIStore только базовые состояния для демонстрации.

export interface UIState {
  isSettingsOpen: boolean;
  isFileListOpen: boolean;
  isProcessing: boolean;
  isProgressModalOpen: boolean;

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

      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleFileList: () =>
        set((state) => ({ isFileListOpen: !state.isFileListOpen })),
      setIsProcessing: (isProcessing: boolean) =>
        set({ isProcessing }),
      openProgressModal: () =>
        set({ isProgressModalOpen: true }),
      closeProgressModal: () =>
        set({ isProgressModalOpen: false }),
    }),
    { name: 'UIStore' }
  )
);