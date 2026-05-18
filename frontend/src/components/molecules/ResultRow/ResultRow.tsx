// frontend/src/components/molecules/ResultRow/ResultRow.tsx
import React from 'react';
import { ProcessingJob } from '../../../types';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
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
          />
        ) : (
          <div className={styles.previewPlaceholder} />
        )}
      </div>

      <span className={styles.filename}>{job.originalFilename}</span>
      <span className={styles.title}>
        {job.metadata?.title ?? '—'}
      </span>
    </div>
  );
};