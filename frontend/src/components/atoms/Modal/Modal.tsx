// Modal
import React from 'react';
import styles from './Modal.module.scss';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  // закрывать ли по клику на backdrop
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeOnBackdrop = true,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};