import React from 'react';
import styles from './BottomActionBar.module.scss';

export const BottomActionBar: React.FC = () => {
  return (
    <div className={styles.actionBar}>
      <button className={styles.primary}>Start processing</button>
      <button className={styles.secondary}>Clear all</button>
    </div>
  );
};
