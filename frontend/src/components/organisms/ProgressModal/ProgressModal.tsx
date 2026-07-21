// frontend/src/components/organisms/ProgressModal/ProgressModal.tsx
import React, { useState } from 'react';
import styles from './ProgressModal.module.scss';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { useToastStore } from 'store/useToastStore';
import { jobsApi } from 'services/api/api';
import { AI_PROVIDER_LABELS } from 'types';

export const ProgressModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const jobs = useAppStore((state) => state.jobs);
  const currentProcessingProvider = useUIStore(
    (state) => state.currentProcessingProvider,
  );

  const total = jobs.length;
  const current = jobs.filter(
    (j) => j.status === "done" || j.status === "error",
  ).length;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  const currentJobId = useUIStore((state) => state.currentJobId);
  const resetProcessingState = useUIStore(
    (state) => state.resetProcessingState,
  );
  const cancelBatchProcessing = useAppStore(
    (state) => state.cancelBatchProcessing,
  );
  const addToast = useToastStore((state) => state.addToast);

  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
    if (isCancelling) return;

    setIsCancelling(true);

    try {
      if (currentJobId) {
        await jobsApi.cancel(currentJobId);
      }
    } catch (error) {
      console.error("[ProgressModal] Cancel request failed:", error);
      addToast("Failed to cancel processing on the server", "error");
    } finally {
      // Локальный сброс делаем в любом случае — пользователь не должен
      // остаться в залипшей модалке из-за сетевой ошибки.
      cancelBatchProcessing();
      resetProcessingState();
      setIsCancelling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      closeOnBackdrop={false}
      closeOnEscape
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.row}>
          <p className={styles.label}>
            Processing: {current}/{total}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </Button>
        </div>
        {currentProcessingProvider && (
          <p className={styles.provider}>
            Using{' '}
            {AI_PROVIDER_LABELS[currentProcessingProvider] ??
              currentProcessingProvider}
          </p>
        )}
        <ProgressBar value={percent} animated={percent < 100} />
      </div>
    </Modal>
  );
};
