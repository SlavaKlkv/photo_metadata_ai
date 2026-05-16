// Select atom component
import React from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
  helper?: string;
  icon?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, helper, icon, ...props }, ref) => {
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <div className={styles.selectWrapper}>
          {icon && <span className={styles.leftIcon}>{icon}</span>}
          <select ref={ref} className={styles.select} {...props}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Icon name="arrow-down" className={styles.rightIcon} />
        </div>
        {helper && <small className={styles.helper}>{helper}</small>}
      </div>
    );
  }
);

Select.displayName = 'Select';