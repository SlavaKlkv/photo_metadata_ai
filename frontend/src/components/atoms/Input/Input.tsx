// frontend/src/components/atoms/Input/Input.tsx
import React, {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import styles from './Input.module.scss';

export interface InputProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
  variant?: 'context' | 'metadata'; // context — большой, metadata — компактный
  counter?: React.ReactNode;
  counterError?: boolean;
  fillHeight?: boolean;
}

export const Input = React.forwardRef<HTMLTextAreaElement, InputProps>(
  (
    {
      hasError = false,
      variant = 'context',
      counter,
      counterError = false,
      fillHeight = false,
      className,
      onChange,
      value,
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(
      ref,
      () => innerRef.current as HTMLTextAreaElement,
      [innerRef],
    );

    const adjustHeight = () => {
      if (variant !== 'metadata') return;
      const textarea = innerRef.current;
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    };

    useLayoutEffect(() => {
      adjustHeight();
    }, [value, variant]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onChange) onChange(event);
      adjustHeight();
    };

    return (
      <div className={`${styles.inputWrapper} ${fillHeight ? styles.fillHeight : ''}`}>
        <textarea
          ref={innerRef}
          className={`${styles.input} ${styles[variant]} ${hasError ? styles.error : ''} ${
            counter ? styles.hasCounter : ''
          } ${fillHeight ? styles.fillHeight : ''} ${className ?? ''}`}
          onChange={handleChange}
          value={value}
          {...props}
        />
        {counter ? (
          <div
            className={`${styles.counter} ${counterError ? styles.counterError : ''}`}
          >
            {counter}
          </div>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
