export {};

declare global {
  interface Window {
    desktopShell?: {
      setAppBusy?: (busy: boolean) => void;
      downloadUpdate?: () => Promise<void>;
      onUpdateDownloadEnded?: (callback: () => void) => () => void;
    };
  }
}
