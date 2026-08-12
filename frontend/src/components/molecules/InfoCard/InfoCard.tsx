// InfoCard molecule component
import React from 'react';
import styles from './InfoCard.module.scss';

export interface InfoCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({ icon, title, description }) => {
  return (
    // В узком окне карточка сжимается до одной иконки, а текст
    // раскрывается по наведению — tabIndex оставляет его доступным
    // с клавиатуры, когда наведение недоступно.
    <div className={styles.card} tabIndex={0} aria-label={title}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.text}>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
};