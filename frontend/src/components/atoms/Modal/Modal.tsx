// frontend/src/components/atoms/Modal/Modal.tsx
import React from 'react';
import styles from './Modal.module.scss';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  // закрывать ли по клику на backdrop
  closeOnBackdrop?: boolean;
  // закрывать ли по Escape — opt-in, чтобы не менять поведение
  // модалок, где выход по клавише нежелателен
  closeOnEscape?: boolean;
  children: React.ReactNode;
  size?: 'md' | 'lg'; // добавляем пропс для размера
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = false,
  size = 'md',
  children,
}) => {
  React.useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

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