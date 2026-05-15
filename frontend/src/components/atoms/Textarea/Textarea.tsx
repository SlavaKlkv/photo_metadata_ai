// Textarea atom component
import React from 'react';
import styles from './Textarea.module.scss';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  charLimit?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helper, charLimit, value, ...props }, ref) => {
    const charCount = String(value || '').length;
    
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <textarea
          ref={ref}
          className={styles.textarea}
          value={value}
          maxLength={charLimit}
          {...props}
        />
        <div className={styles.footer}>
          {helper && <small className={styles.helper}>{helper}</small>}
          {charLimit && (
            <small className={styles.charCount}>
              {charCount}/{charLimit}
            </small>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';