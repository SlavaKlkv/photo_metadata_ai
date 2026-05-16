// Divider
import React from 'react';
import styles from './Divider.module.scss';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: 'sm' | 'md' | 'lg';
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  spacing = 'md',
}) => {
  return <hr className={`${styles.divider} ${styles[orientation]} ${styles[spacing]}`} />;
};