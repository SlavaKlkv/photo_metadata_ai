// Input atom component
import React from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Input.module.scss';

const CHAR_LIMIT = 600;
const HINT_TEXT =
  'Describe the context of the shooting, and the following questions will help you — Where? What? When? E.g., "New York, Central Park. Sunset, two people on a bench. 10 may 2026"';

export interface InputProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {
  label?: string;
  helper?: string;
  error?: string;
  showCharCounter?: boolean;
}

export const Input = React.forwardRef<HTMLTextAreaElement, InputProps>(
  ({ label, helper, error, showCharCounter = true, value = '', ...props }, ref) => {
    const [isFilled, setIsFilled] = React.useState(Boolean(value));
    const [charCount, setCharCount] = React.useState(
      typeof value === 'string' ? value.length : 0
    );
    const isOverLimit = charCount > CHAR_LIMIT;
    const isEmpty = !isFilled && charCount === 0;

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.currentTarget.value;
      setCharCount(newValue.length);
      setIsFilled(newValue.length > 0);
      props.onChange?.(e);
    };

    const displayError =
      error || (isEmpty && isFilled !== undefined && !isFilled ? 'The field must be filled in' : null);

    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <div className={styles.inputWrapper}>
          <textarea
            ref={ref}
            className={`${styles.input} ${displayError || isOverLimit ? styles.error : ''}`}
            value={value}
            onChange={handleChange}
            maxLength={CHAR_LIMIT}
            placeholder={HINT_TEXT}
            {...props}
          />
          {showCharCounter && (
            <div className={`${styles.charCounter} ${isOverLimit ? styles.counterError : ''}`}>
              {charCount}/{CHAR_LIMIT}
            </div>
          )}
        </div>
        {displayError && (
          <small className={styles.errorText}>
            <Icon name="error-icon" className={styles.errorIcon} />
            {displayError}
          </small>
        )}
        {isOverLimit && (
          <small className={styles.errorText}>
            <Icon name="error-icon" className={styles.errorIcon} />
            The allowed number of characters has been exceeded. Make the description shorter.
          </small>
        )}
        {helper && !displayError && !isOverLimit && (
          <small className={styles.helper}>{helper}</small>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';