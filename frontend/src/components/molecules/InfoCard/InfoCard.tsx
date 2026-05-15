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
    <div className={styles.card}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
};