import React from 'react';
import styles from './SettingsPanel.module.scss';

export const SettingsPanel: React.FC = () => {
  return (
    <section className={styles.panel}>
      <h2>Settings</h2>
      <p>Configure your export settings and AI provider here.</p>
    </section>
  );
};
