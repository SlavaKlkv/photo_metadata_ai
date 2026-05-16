// ProgressModal
import React from 'react';
import styles from './ProgressModal.module.scss';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useUIStore } from '../../../store/useUIStore';

interface ProgressModalProps {
  current: number;
  total: number;
  onCancel: () => void;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  current,
  total,
  onCancel,
}) => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const closeModal = useUIStore((state) => state.closeProgressModal);

  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Modal isOpen={isOpen} onClose={closeModal} closeOnBackdrop={false}>
      <div className={styles.content}>
        <p className={styles.label}>
          Processing: {current}/{total}
        </p>
        <ProgressBar value={percent} animated={percent < 100} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className={styles.cancel}
        >
          Cancel
        </Button>
      </div>
    </Modal>
  );
};