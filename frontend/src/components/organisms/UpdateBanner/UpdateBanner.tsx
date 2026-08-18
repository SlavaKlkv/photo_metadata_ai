import React, { useEffect } from 'react';
import { Button } from '../../atoms/Button/Button';
import { useAppStore } from '../../../store/useAppStore';
import styles from './UpdateBanner.module.scss';

export const UpdateBanner: React.FC = () => {
  const isVisible = useAppStore((state) => state.isUpdateBannerVisible);
  const updateInfo = useAppStore((state) => state.updateInfo);
  const dismiss = useAppStore((state) => state.dismissUpdateBanner);
  const hideUpdateBanner = useAppStore((state) => state.hideUpdateBanner);
  const restoreUpdateBanner = useAppStore((state) => state.restoreUpdateBanner);

  useEffect(() => {
    const subscribe = window.desktopShell?.onUpdateDownloadEnded;
    if (!subscribe) {
      return;
    }

    return subscribe(() => {
      restoreUpdateBanner();
    });
  }, [restoreUpdateBanner]);

  if (!isVisible || !updateInfo?.latest_version) {
    return null;
  }

  const downloadUrl = updateInfo.download_url;
  const fallbackUrl = downloadUrl ?? updateInfo.release_url;

  const download = () => {
    if (downloadUrl && window.desktopShell?.downloadUpdate) {
      hideUpdateBanner();
      void window.desktopShell.downloadUpdate().catch(() => {
        restoreUpdateBanner();
      });
      return;
    }

    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={styles.banner} role="status">
      <span className={styles.message}>
        Version {updateInfo.latest_version} is available
      </span>
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onClick={download}
          disabled={!fallbackUrl}
        >
          Download
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
};
