import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number; // milliseconds, undefined = infinite
}

export interface ToastState {
  toasts: Toast[];
  
  // Actions
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

/**
 * Zustand Store для уведомлений (Toast notifications)
 * Интегрирован с Redux DevTools для отладки
 */
export const useToastStore = create<ToastState>()(
  devtools(
    (set) => ({
      toasts: [],

      /**
       * Добавить новое уведомление
       * @param message - текст уведомления
       * @param type - тип: success | error | info | warning
       * @param duration - время показа в миллисекундах (default: 3000 для success, infinite для error)
       */
      addToast: (message: string, type: ToastType, duration?: number) => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        const defaultDuration = type === 'error' ? undefined : duration ?? 3000;

        set((state) => ({
          toasts: [...state.toasts, { id, message, type, duration: defaultDuration }],
        }));

        // Auto-remove if duration is specified
        if (defaultDuration) {
          setTimeout(() => {
            set((state) => ({
              toasts: state.toasts.filter((t) => t.id !== id),
            }));
          }, defaultDuration);
        }
      },

      /**
       * Удалить уведомление по ID
       */
      removeToast: (id: string) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      /**
       * Очистить все уведомления
       */
      clearAll: () => {
        set({ toasts: [] });
      },
    }),
    { name: 'ToastStore' }
  )
);
