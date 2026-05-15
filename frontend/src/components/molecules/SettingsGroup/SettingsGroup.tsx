// SettingsGroup molecule component
import React from 'react';
import styles from './SettingsGroup.module.scss';

export interface SettingsGroupProps {
  label: string;
  children: React.ReactNode;
  helper?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({ label, children, helper }) => {
  return (
    <div className={styles.group}>
      <label className={styles.label}>{label}</label>
      {children}
      {helper && <small className={styles.helper}>{helper}</small>}
    </div>
  );
};