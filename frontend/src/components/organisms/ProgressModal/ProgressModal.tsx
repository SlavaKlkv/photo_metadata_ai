// ProgressModal
import React from 'react';
import styles from './ProgressModal.module.scss';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';

export const ProgressModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const closeModal = useUIStore((state) => state.closeProgressModal);
  const jobs = useAppStore((state) => state.jobs);

  const total = jobs.length;
  const current = jobs.filter(
    (j) => j.status === 'done' || j.status === 'error',
  ).length;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  const handleCancel = () => {
    closeModal();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} closeOnBackdrop={false}>
      <div className={styles.content}>
        <div className={styles.row}>
          <p className={styles.label}>
            Processing: {current}/{total}
          </p>
          <Button variant="secondary" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <ProgressBar value={percent} animated={percent < 100} />
      </div>
    </Modal>
  );
};