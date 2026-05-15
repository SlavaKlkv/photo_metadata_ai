// ProgressBar atom component
import React from 'react';
import styles from './ProgressBar.module.scss';

export interface ProgressBarProps {
  value: number; // 0-100
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, animated = true }) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  
  return (
    <div className={styles.progressBar}>
      <div
        className={`${styles.fill} ${animated ? styles.animated : ''}`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};
