import React from 'react';
import styles from './ProgressModal.module.scss';
import { useUIStore } from '../../../store/useUIStore';

export const ProgressModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const closeModal = useUIStore((state) => state.closeProgressModal);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={closeModal}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Processing</h2>
        <p>Your photos are being prepared. Please wait...</p>
        <button onClick={closeModal}>Close</button>
      </div>
    </div>
  );
};
