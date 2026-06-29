// frontend/src/components/organisms/ProgressModal/ProgressModal.tsx
import React from 'react';
import styles from './ProgressModal.module.scss';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { AI_PROVIDER_LABELS } from 'types';

export const ProgressModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const closeModal = useUIStore((state) => state.closeProgressModal);
  const jobs = useAppStore((state) => state.jobs);
  const currentProcessingProvider = useUIStore(
    (state) => state.currentProcessingProvider,
  );

  const total = jobs.length;
  const current = jobs.filter(
    (j) => j.status === "done" || j.status === "error",
  ).length;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const displayPercent =
  percent === 100 ? 100 : Math.max(percent, 20); // don't show less than 20% to avoid confusion

  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);

  const handleCancel = () => {
    setIsPollingActive(false);
    closeModal();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} closeOnBackdrop={false} size="md">
      <div className={styles.content}>
        <div className={styles.row}>
          <p className={styles.label}>
            Processing: {current}/{total}
          </p>
          <Button variant="secondary" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        {currentProcessingProvider && (
          <p className={styles.provider}>
            Using{' '}
            {AI_PROVIDER_LABELS[currentProcessingProvider] ??
              currentProcessingProvider}
          </p>
        )}
        <ProgressBar value={displayPercent} animated={displayPercent < 100} />
      </div>
    </Modal>
  );
};
