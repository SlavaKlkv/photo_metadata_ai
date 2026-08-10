// frontend/src/components/molecules/SectionHeader/SectionHeader.tsx
import React from "react";
import { Icon, IconName } from "../../atoms/Icon/Icon";
import styles from "./SectionHeader.module.scss";

interface SectionHeaderProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  titleTag?: React.ElementType;
  variant?: "default" | "app";
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  subtitle,
  titleTag: TitleTag = "h2",
  variant = "default",
}) => {
  const TitleComponent = TitleTag as React.ElementType;
  const isApp = variant === "app";
  const rootClass = isApp ? styles.appHeader : styles.header;

  return (
    <div className={rootClass}>
      <div className={styles.topRow}>
        <div className={styles.headerIcon}>
          <Icon name={icon} className={styles.icon} />
        </div>

        {isApp ? (
          <div className={styles.headerText}>
            <TitleComponent className={styles.title}>{title}</TitleComponent>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        ) : (
          <TitleComponent className={styles.title}>{title}</TitleComponent>
        )}
      </div>

      {!isApp && subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
};
