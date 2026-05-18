// frontend/src/components/organisms/ResultsTable/ResultsTable.tsx
import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';
import { ResultRow } from '../../molecules/ResultRow/ResultRow';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import { Panel } from '../../atoms/Panel/Panel';
import styles from './ResultsTable.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const previews = useAppStore((state) => state.previews);

  //const doneJobs = jobs.filter((j) => j.status === 'done');
  const visibleJobs = jobs; // отображаем все, даже с ошибкой, чтобы можно было выбрать и посмотреть превью и ошибку
  const allChecked = checkedIds.size === visibleJobs.length && visibleJobs.length > 0;

  const handleCheckAll = (checked: boolean) => {
    setCheckedIds(checked ? new Set(visibleJobs.map((j) => j.id)) : new Set());
  };

  const handleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  return (
    <Panel className={styles.settingsPanel} direction="column" gap="md">
            {/* Заголовок */}
            <SectionHeader
              icon="results-icon"
              title="Results"
              subtitle={`${visibleJobs.length} photos`}
            />

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
        {visibleJobs.map((job) => (
          <ResultRow
            key={job.id}
            job={job}
            previewUrl={previews[job.id]}
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
        {checkedIds.size < visibleJobs.length && (
          <button
            className={styles.selectAll}
            onClick={() => handleCheckAll(true)}
          >
            Select all {visibleJobs.length}
          </button>
        )}
      </div>
    </Panel>
  );
};