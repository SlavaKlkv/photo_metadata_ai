// Radio atom component based on Checkbox styles
import React from 'react';
import styles from './Radio.module.scss';

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, checked = false, className, ...inputProps }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const finalRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    return (
      <label className={`${styles.radioLabel} ${className ?? ''}`.trim()}>
        <input
          ref={finalRef}
          type="radio"
          className={styles.input}
          checked={checked}
          {...inputProps}
        />
        <span className={styles.radioOuter}>
          <span className={styles.radioDot} />
        </span>
        {label && <span className={styles.label}>{label}</span>}
      </label>
    );
  },
);

Radio.displayName = 'Radio';
