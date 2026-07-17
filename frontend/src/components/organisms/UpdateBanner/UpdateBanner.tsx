import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { useAppStore } from '../../../store/useAppStore';
import styles from './UpdateBanner.module.scss';

export const UpdateBanner: React.FC = () => {
  const isVisible = useAppStore((state) => state.isUpdateBannerVisible);
  const updateInfo = useAppStore((state) => state.updateInfo);
  const dismiss = useAppStore((state) => state.dismissUpdateBanner);

  if (!isVisible || !updateInfo?.latest_version) {
    return null;
  }

  const downloadUrl = updateInfo.download_url ?? updateInfo.release_url;

  const download = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
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
          disabled={!downloadUrl}
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
