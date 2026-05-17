// ResultRow
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
}

export const ResultRow: React.FC<ResultRowProps> = ({
  job,
  isSelected,
  isChecked,
  onSelect,
  onCheck,
}) => {
  return (
    <div
      className={`${styles.row} ${isSelected ? styles.selected : ''}`}
      onClick={() => onSelect(job.id)}
    >
      <div className={styles.checkboxCell} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isChecked}
          onChange={(e) => onCheck(job.id, e.target.checked)}
        />
      </div>

      {/* превью — пока заглушка, реального URL нет в типах */}
      <div className={styles.preview}>
        <div className={styles.previewPlaceholder} />
      </div>

      <span className={styles.filename}>{job.originalFilename}</span>
      <span className={styles.title}>
        {job.metadata?.title ?? '—'}
      </span>
    </div>
  );
};