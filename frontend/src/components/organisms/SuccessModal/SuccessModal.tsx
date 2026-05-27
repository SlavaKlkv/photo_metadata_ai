// frontend/src/components/organisms/SuccessModal/SuccessModal.tsx
import React from 'react';
import { Modal } from '../../atoms/Modal/Modal';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { useUIStore } from '../../../store/useUIStore';
import { useAppStore } from '../../../store/useAppStore';
import styles from './SuccessModal.module.scss';

export const SuccessModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isSuccessModalOpen);
  const closeSuccessModal = useUIStore((state) => state.closeSuccessModal);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsExporting = useUIStore((state) => state.setIsExporting);
  const resetBatchState = useAppStore((state) => state.resetBatchState);
  const previews = useAppStore((state) => state.previews);
  const jobs = useAppStore((state) => state.jobs);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);

  const handleBackToResults = () => {
    closeSuccessModal();
    setIsExporting(false);
  };

  const handleStartNewBatch = () => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    resetBatchState();
    setIsUploaded(false);
    setIsExportReady(false);
    setIsExporting(false);
    setCurrentJobId(null);
    setSelectedJobId(null);
    closeSuccessModal();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeSuccessModal} closeOnBackdrop={false}>
      <div className={styles.content}>
        <Icon name="img-modal-icon" className={styles.icon} />
        <h2 className={styles.title}>Export completed successfully!</h2>
        <p className={styles.subtitle}>
          {jobs.length} photos are ready for stock upload. CSV file generated, IPTC metadata embedded, approved photos exported.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" size="md" onClick={handleBackToResults}>
            Back to results
          </Button>
          <Button variant="secondary" size="md" onClick={handleStartNewBatch}>
            Start new batch
          </Button>
          <Button variant="primary" size="md" onClick={closeSuccessModal}>
            Open export folder
          </Button>
        </div>
      </div>
    </Modal>
  );
};