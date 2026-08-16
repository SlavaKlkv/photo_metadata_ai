export type BlockingAppProcessState = {
  isProcessing: boolean;
  isExporting: boolean;
  regeneratingFileId: string | null;
};

/** True while a long-running desktop process should block quit. */
export function isBlockingAppProcess(
  state: BlockingAppProcessState,
): boolean {
  return (
    state.isProcessing ||
    state.isExporting ||
    state.regeneratingFileId != null
  );
}

export function setDesktopAppBusy(busy: boolean): void {
  window.desktopShell?.setAppBusy?.(busy);
}
