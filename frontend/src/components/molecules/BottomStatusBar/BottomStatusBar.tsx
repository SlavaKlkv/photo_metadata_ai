import React from 'react';
import styles from './BottomStatusBar.module.scss';

export const BottomStatusBar: React.FC = () => {
  return (
    <footer className={styles.statusBar}>
      <span>Ready to upload your first photo.</span>
    </footer>
  );
};
