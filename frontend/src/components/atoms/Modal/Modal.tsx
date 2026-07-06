// frontend/src/components/atoms/Modal/Modal.tsx
import React from 'react';
import styles from './Modal.module.scss';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  // закрывать ли по клику на backdrop
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
  size?: 'md' | 'lg'; // добавляем пропс для размера
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeOnBackdrop = true,
  size = 'md',
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`${styles.modal} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};