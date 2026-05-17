// frontend/src/components/organisms/ResultsTable/ResultsTable.tsx
import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';
import { ResultRow } from '../../molecules/ResultRow/ResultRow';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import { Panel } from '../../atoms/Panel/Panel';
import { Icon } from '../../atoms/Icon/Icon';
import styles from './ResultsTable.module.scss';

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);

  const doneJobs = jobs.filter((j) => j.status === 'done');
  const allChecked = checkedIds.size === doneJobs.length && doneJobs.length > 0;

  const handleCheckAll = (checked: boolean) => {
    setCheckedIds(checked ? new Set(doneJobs.map((j) => j.id)) : new Set());
  };

  const handleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  return (
    <Panel className={styles.panel} direction="column" gap="md">
      {/* Заголовок */}
      <div className={styles.header}>
        <Icon name="results-icon" className={styles.headerIcon} />
        <div>
          <h2>Results</h2>
          <p>{doneJobs.length} photos</p>
        </div>
      </div>

      {/* Шапка таблицы */}
      <div className={styles.tableHeader}>
        <div className={styles.checkboxCell}>
          <Checkbox
            checked={allChecked}
            onChange={(e) => handleCheckAll(e.target.checked)}
          />
        </div>
        <span>Preview</span>
        <span>Filename</span>
        <span>Generated title</span>
      </div>

      {/* Строки */}
      <div className={styles.rows}>
        {doneJobs.map((job) => (
          <ResultRow
            key={job.id}
            job={job}
            isSelected={selectedJobId === job.id}
            isChecked={checkedIds.has(job.id)}
            onSelect={setSelectedJobId}
            onCheck={handleCheck}
          />
        ))}
      </div>

      {/* Футер */}
      <div className={styles.footer}>
        <span>{checkedIds.size} selected</span>
        {checkedIds.size < doneJobs.length && (
          <button
            className={styles.selectAll}
            onClick={() => handleCheckAll(true)}
          >
            Select all {doneJobs.length}
          </button>
        )}
      </div>
    </Panel>
  );
};