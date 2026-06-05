// Checkbox atom component
import React from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Checkbox.module.scss';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate = false, checked = false, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const finalRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    React.useEffect(() => {
      if (finalRef.current) {
        finalRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate, finalRef]);

    const renderIcon = () => {
      if (indeterminate) {
        return <Icon name="dash-icon" className={styles.checkIcon} />;
      }

      if (checked) {
        return <Icon name="checkbox-icon" className={styles.checkIcon} />;
      }

      return null;
    };

    return (
      <label className={styles.checkboxLabel}>
        <input
          ref={finalRef}
          type="checkbox"
          className={styles.input}
          checked={checked}
          {...props}
        />

        <span
          className={`${styles.checkmark} ${
            indeterminate ? styles.indeterminate : ""
          }`}
        >
          {indeterminate ? (
            <Icon name="dash-icon" className={styles.checkIcon} />
          ) : checked ? (
            <Icon name="checkbox-icon" className={styles.checkIcon} />
          ) : null}
        </span>

        {label && <span className={styles.label}>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';