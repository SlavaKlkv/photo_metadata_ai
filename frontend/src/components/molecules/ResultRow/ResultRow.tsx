// frontend/src/components/molecules/ResultRow/ResultRow.tsx
import React from 'react';
import { AI_PROVIDER_LABELS, ProcessingJob } from 'types';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import {
  getJobValidationGroup,
  VALIDATION_GROUP_HINTS,
  VALIDATION_GROUP_SHORT_LABELS,
} from 'utils/validationGroups';
import styles from './ResultRow.module.scss';

interface ResultRowProps {
  job: ProcessingJob;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  previewUrl?: string;
}

export const ResultRow: React.FC<ResultRowProps> = ({
  job,
  isSelected,
  isChecked,
  onSelect,
  onCheck,
  previewUrl,
}) => {
  // маркер группы виден и без фильтра — иначе строки не читаются
  const validationGroup = getJobValidationGroup(job);

  return (
    <div
      className={`${styles.row} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(job.id)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(job.id);
        }
      }}
    >
      <div className={styles.checkboxCell} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isChecked}
          onChange={(e) => onCheck(job.id, e.target.checked)}
        />
      </div>

      <div className={styles.preview}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={job.originalFilename}
            className={styles.previewImg}
            decoding="async"
          />
        ) : (
          <div className={styles.previewPlaceholder} />
        )}
      </div>

      <span className={styles.filename}>{job.originalFilename}</span>
      {/* Только цветная точка: подпись съедала место у заголовка.
          Расшифровка остаётся в подсказке и для скринридеров. */}
      <span
        className={`${styles.validationBadge} ${styles[validationGroup]}`}
        title={VALIDATION_GROUP_HINTS[validationGroup]}
        aria-label={VALIDATION_GROUP_SHORT_LABELS[validationGroup]}
        role="img"
      >
        <span className={styles.validationDot} />
      </span>
      <div className={styles.titleCell}>
        <span className={styles.title}>
          {job.metadata?.title ?? '—'}
        </span>
        {job.effective_ai_provider && (
          <span className={styles.providerBadge}>
            {AI_PROVIDER_LABELS[job.effective_ai_provider] ??
              job.effective_ai_provider}
          </span>
        )}
      </div>
    </div>
  );
};
