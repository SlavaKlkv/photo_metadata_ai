// frontend/src/components/molecules/SectionHeader/SectionHeader.tsx
import React from "react";
import { Icon, IconName } from "../../atoms/Icon/Icon";
import styles from "./SectionHeader.module.scss";

interface SectionHeaderProps {
  icon: IconName;
  title: string;
  subtitle?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  subtitle,
}) => {
  return (
    <div className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.headerIcon}>
          <Icon name={icon} className={styles.icon} />
        </div>
        <h2 className={styles.title}>{title}</h2>
      </div>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
};