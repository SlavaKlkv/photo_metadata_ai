// frontend/src/components/organisms/ResultsTable/ResultsTable.tsx
import React, { useState } from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { jobsApi } from 'services/api/api';
import { ResultRow } from 'components/molecules/ResultRow/ResultRow';
import { Checkbox } from 'components/atoms/Checkbox/Checkbox';
import { Panel } from 'components/atoms/Panel/Panel';
import styles from './ResultsTable.module.scss';
import { SectionHeader } from 'components/molecules/SectionHeader/SectionHeader';

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const updateJobSelection = useAppStore((state) => state.updateJobSelection);
  const updateAllJobsSelection = useAppStore(
    (state) => state.updateAllJobsSelection,
  );
  const currentJobId = useUIStore((state) => state.currentJobId);
  const visibleJobs = jobs; // отображаем все, даже с ошибкой, чтобы можно было выбрать и посмотреть превью и ошибку
  const selectedCount = visibleJobs.filter(
    (job) => job.selected_for_export !== false,
  ).length;
  const allChecked =
    selectedCount === visibleJobs.length && visibleJobs.length > 0;
  // локальный стейт пагинации — не в batch state, сбрасывается при смене данных
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(visibleJobs.length / PAGE_SIZE);
  const paginatedJobs = visibleJobs.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const previews = useAppStore((state) => state.previews);

  const handleCheckAll = async (checked: boolean) => {
    if (!currentJobId) return;

    updateAllJobsSelection(checked);

    try {
      await jobsApi.updateSelection(currentJobId, checked);
    } catch {
      updateAllJobsSelection(!checked);
    }
  };

  const handleCheck = async (id: string, checked: boolean) => {
    if (!currentJobId) return;

    updateJobSelection(id, checked);

    try {
      const { data } = await jobsApi.updateMetadata(currentJobId, id, {
        selected_for_export: checked,
      });
      updateJobSelection(id, data.selected_for_export ?? checked);
    } catch {
      updateJobSelection(id, !checked);
    }
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
        {paginatedJobs.map((job) => (
          <ResultRow
            key={job.id}
            job={job}
            previewUrl={previews[job.id]}
            isSelected={selectedJobId === job.id}
            isChecked={job.selected_for_export !== false}
            onSelect={setSelectedJobId}
            onCheck={handleCheck}
          />
        ))}
      </div>

      {/* Футер */}
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <span>{selectedCount} selected</span>
          {selectedCount < visibleJobs.length && (
            <button
              className={styles.selectAll}
              onClick={() => handleCheckAll(true)}
            >
              Select all {visibleJobs.length}
            </button>
          )}
        </div>

        {/* Pagination — показываем только если страниц больше одной */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ←
            </button>

            {/* Показываем: первые 3, ..., последнюю — как на макете */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p <= 3 || p === totalPages || p === currentPage)
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                  acc.push("ellipsis");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${idx}`} className={styles.ellipsis}>
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    className={`${styles.pageBtn} ${currentPage === item ? styles.pageBtnActive : ""}`}
                    onClick={() => setCurrentPage(item as number)}
                  >
                    {item}
                  </button>
                ),
              )}

            <button
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              →
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
};
