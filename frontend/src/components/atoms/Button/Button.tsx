// Button atom component
import React from 'react';
import styles from './Button.module.scss';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, iconPosition = 'left', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${styles.button} ${styles[variant]} ${styles[size]}`}
        {...props}
      >
        {icon && iconPosition === 'left' && <span className={styles.icon}>{icon}</span>}
        {props.children}
        {icon && iconPosition === 'right' && <span className={styles.icon}>{icon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';