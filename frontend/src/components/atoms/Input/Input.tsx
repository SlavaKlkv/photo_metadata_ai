// Input atom component
import React from 'react';
import styles from './Input.module.scss';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helper, error, ...props }, ref) => {
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <input
          ref={ref}
          className={`${styles.input} ${error ? styles.error : ''}`}
          {...props}
        />
        {helper && <small className={styles.helper}>{helper}</small>}
        {error && <small className={styles.errorText}>{error}</small>}
      </div>
    );
  }
);

Input.displayName = 'Input';