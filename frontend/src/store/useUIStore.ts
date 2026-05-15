import { create } from 'zustand';
import { devtools } from 'zustand/middleware';


//TODO: возможно, стоит объединить UIStore и AppStore в один глобальный Store, так как они тесно связаны. Но для чистоты архитектуры пока оставим их раздельными.

//TODO: добавить больше UI-состояний, например, для управления модальными окнами, спиннерами загрузки и т.д. Сейчас в UIStore только базовые состояния для демонстрации.

//TODO: проверить, почемуу не работают в FileUpload.tsx:  
  // const addJobs = useAppStore((state) => state.addJobs);
  //const jobs = useAppStore((state) => state.jobs);
  //const openProgressModal = useUIStore((state) => state.openProgressModal);
  //const addToast = useUIStore((state) => state.addToast);


export interface UIState {
  isSettingsOpen: boolean;
  isFileListOpen: boolean;
  isProcessing: boolean;

  // Actions
  toggleSettings: () => void;
  toggleFileList: () => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      isSettingsOpen: false,
      isFileListOpen: true,
      isProcessing: false,

      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleFileList: () =>
        set((state) => ({ isFileListOpen: !state.isFileListOpen })),
      setIsProcessing: (isProcessing: boolean) =>
        set({ isProcessing }),
    }),
    { name: 'UIStore' }
  )
);