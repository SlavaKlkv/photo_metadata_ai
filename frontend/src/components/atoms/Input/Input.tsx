// frontend/src/components/atoms/Input/Input.tsx
import React from 'react';
import styles from './Input.module.scss';

export interface InputProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLTextAreaElement, InputProps>(
  ({ hasError = false, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`${styles.input} ${hasError ? styles.error : ''} ${className ?? ''}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';