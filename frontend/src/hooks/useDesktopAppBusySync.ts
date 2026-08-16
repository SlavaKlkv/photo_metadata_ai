import { useEffect } from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { isBlockingAppProcess, setDesktopAppBusy } from 'utils/appBusy';

/**
 * Сообщает Electron shell, что идёт длительный процесс —
 * main показывает подтверждение при закрытии / Cmd+Q.
 * В браузере без preload вызов no-op.
 */
export function useDesktopAppBusySync(): void {
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExporting = useUIStore((state) => state.isExporting);
  const regeneratingFileId = useAppStore((state) => state.regeneratingFileId);

  useEffect(() => {
    const busy = isBlockingAppProcess({
      isProcessing,
      isExporting,
      regeneratingFileId,
    });
    setDesktopAppBusy(busy);
    return () => {
      setDesktopAppBusy(false);
    };
  }, [isProcessing, isExporting, regeneratingFileId]);
}
