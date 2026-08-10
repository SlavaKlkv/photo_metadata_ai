// frontend/src/components/atoms/Text/Text.tsx
import React from 'react';
import styles from './Text.module.scss';

export interface TextProps {
  variant?: 'body' | 'caption' | 'label' | 'helper';
  color?: 'primary' | 'secondary' | 'placeholder';
  as?: 'p' | 'span' | 'div' | 'label';
  children: React.ReactNode;
  className?: string;
}

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  color = 'primary',
  as: Tag = 'p',
  children,
  className,
}) => {
  return (
    <Tag className={`${styles.text} ${styles[variant]} ${styles[color]} ${className ?? ''}`}>
      {children}
    </Tag>
  );
};