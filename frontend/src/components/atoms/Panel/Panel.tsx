// frontend/src/components/atoms/Panel/Panel.tsx
import React from 'react';
import styles from './Panel.module.scss';

export interface PanelProps {
  children: React.ReactNode;
  className?: string;
  // направление flex — в Settings колонка, в Results строка
  direction?: 'row' | 'column';
  // gap между дочерними элементами
  gap?: 'sm' | 'md' | 'lg';
}

export const Panel: React.FC<PanelProps> = ({
  children,
  className,
  direction = 'column',
  gap = 'md',
}) => {
  return (
    <div className={`${styles.panel} ${styles[direction]} ${styles[`gap-${gap}`]} ${className ?? ''}`}>
      {children}
    </div>
  );
};