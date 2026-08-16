export {};

declare global {
  interface Window {
    desktopShell?: {
      setAppBusy?: (busy: boolean) => void;
    };
  }
}
