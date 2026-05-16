// ProgressBar atom component
import React from 'react';
import styles from './ProgressBar.module.scss';

export interface ProgressBarProps {
  value: number; // 0-100
  size?: 'sm' | 'md';
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  size = 'md',
  animated = false,
}) => {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={`${styles.track} ${styles[size]}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`${styles.fill} ${animated ? styles.animated : ''}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
