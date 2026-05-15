// Checkbox atom component
import React from 'react';
import styles from './Checkbox.module.scss';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const finalRef = (ref as any) || internalRef;
    
    React.useEffect(() => {
      if (finalRef.current) {
        finalRef.current.indeterminate = indeterminate || false;
      }
    }, [indeterminate, finalRef]);
    
    return (
      <label className={styles.checkboxLabel}>
        <input
          ref={finalRef}
          type="checkbox"
          className={styles.input}
          {...props}
        />
        <span className={`${styles.checkmark} ${indeterminate ? styles.indeterminate : ''}`} />
        {label && <span className={styles.label}>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';