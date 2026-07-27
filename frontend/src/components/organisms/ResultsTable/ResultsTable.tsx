// frontend/src/components/organisms/ResultsTable/ResultsTable.tsx
import React, { useEffect, useState } from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { jobsApi } from 'services/api/api';
import { ResultRow } from 'components/molecules/ResultRow/ResultRow';
import { Checkbox } from 'components/atoms/Checkbox/Checkbox';
import { Panel } from 'components/atoms/Panel/Panel';
import styles from './ResultsTable.module.scss';
import { SectionHeader } from 'components/molecules/SectionHeader/SectionHeader';
import { Pagination } from 'components/molecules/Pagination/Pagination';
import { RESULTS_PAGE_SIZE } from 'constants/pagination';
import { ProcessingJob } from 'types';
import { ValidationSummary } from 'components/molecules/ValidationSummary/ValidationSummary';
import {
  countValidationGroups,
  getJobsInValidationGroup,
  getJobValidationGroup,
} from 'utils/validationGroups';

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const updateJobSelection = useAppStore((state) => state.updateJobSelection);
  const updateAllJobsSelection = useAppStore(
    (state) => state.updateAllJobsSelection,
  );
  const applyJobsSelectionMap = useAppStore(
    (state) => state.applyJobsSelectionMap,
  );
  const currentJobId = useUIStore((state) => state.currentJobId);
  const validationFilter = useUIStore((state) => state.validationFilter);
  const setValidationFilter = useUIStore((state) => state.setValidationFilter);
  const [isApplyingSelection, setIsApplyingSelection] = useState(false);
  const groupCounts = countValidationGroups(jobs);
  const readyJobs = getJobsInValidationGroup(jobs, 'ready');
  // экспортировать можно всё, где нет ошибок валидации:
  // готовые файлы и файлы с одними рекомендациями
  const exportableJobs = jobs.filter((job) =>
    ['ready', 'warnings'].includes(getJobValidationGroup(job)),
  );
  // отображаем все, даже с ошибкой, чтобы можно было выбрать и посмотреть
  // превью и ошибку; фильтр сводки сужает список до одной группы
  const visibleJobs = validationFilter
    ? jobs.filter((job) => getJobValidationGroup(job) === validationFilter)
    : jobs;
  // В экспорт уходят все отмеченные файлы батча, а не только видимые
  // сейчас, поэтому в футере показываем именно это число: иначе при
  // активном фильтре «3 selected» противоречит тому, что будет
  // экспортировано.
  const selectedCount = jobs.filter(
    (job) => job.selected_for_export !== false,
  ).length;
  const visibleSelectedCount = visibleJobs.filter(
    (job) => job.selected_for_export !== false,
  ).length;
  const allChecked =
    visibleSelectedCount === visibleJobs.length && visibleJobs.length > 0;
  // страница живёт в UI-store: превью переключает её, уводя выбор за границу страницы
  const currentPage = useUIStore((state) => state.resultsPage);
  const setCurrentPage = useUIStore((state) => state.setResultsPage);
  const totalPages = Math.ceil(visibleJobs.length / RESULTS_PAGE_SIZE);
  const paginatedJobs = visibleJobs.slice(
    (currentPage - 1) * RESULTS_PAGE_SIZE,
    currentPage * RESULTS_PAGE_SIZE,
  );
  // список задач мог сократиться (новый батч, отмена) — не оставляем пустую страницу
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [currentPage, totalPages]);
  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const previews = useAppStore((state) => state.previews);

  // при активном фильтре «выбрать все» относится к видимой группе,
  // иначе пользователь незаметно менял бы скрытые файлы
  const handleCheckAll = async (checked: boolean) => {
    if (!currentJobId) return;

    const previousSelection = Object.fromEntries(
      visibleJobs.map((job) => [job.id, job.selected_for_export !== false]),
    );

    if (validationFilter) {
      applyJobsSelectionMap(
        Object.fromEntries(visibleJobs.map((job) => [job.id, checked])),
      );
    } else {
      updateAllJobsSelection(checked);
    }

    try {
      await jobsApi.updateSelection(
        currentJobId,
        checked,
        validationFilter ? visibleJobs.map((job) => job.id) : undefined,
      );
    } catch {
      applyJobsSelectionMap(previousSelection);
    }
  };

  // Оставляет в экспорте только перечисленные файлы, снимая выбор
  // со всех остальных. Используется массовыми операциями сводки.
  const selectOnlyForExport = async (keptJobs: ProcessingJob[]) => {
    if (!currentJobId || keptJobs.length === 0 || isApplyingSelection) return;

    const previousSelection = Object.fromEntries(
      jobs.map((job) => [job.id, job.selected_for_export !== false]),
    );
    const keptIds = new Set(keptJobs.map((job) => job.id));

    setIsApplyingSelection(true);
    applyJobsSelectionMap(
      Object.fromEntries(jobs.map((job) => [job.id, keptIds.has(job.id)])),
    );

    try {
      await jobsApi.updateSelection(currentJobId, false);
      await jobsApi.updateSelection(currentJobId, true, [...keptIds]);
    } catch {
      applyJobsSelectionMap(previousSelection);
    } finally {
      setIsApplyingSelection(false);
    }
  };

  // Только полностью готовые: без ошибок валидации и без рекомендаций.
  const handleExportReadyOnly = () => selectOnlyForExport(readyJobs);

  // Всё, что валидно для стока: рекомендации экспорту не мешают.
  const handleExportWithoutErrors = () => selectOnlyForExport(exportableJobs);

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
        subtitle={
          validationFilter
            ? `${visibleJobs.length} of ${jobs.length} photos`
            : `${jobs.length} photos`
        }
      />

      {/* Сводка валидации: счётчики групп и фильтр списка */}
      <ValidationSummary
        counts={groupCounts}
        activeGroup={validationFilter}
        totalCount={jobs.length}
        readyCount={readyJobs.length}
        exportableCount={exportableJobs.length}
        isApplyingSelection={isApplyingSelection}
        onSelectGroup={setValidationFilter}
        onExportReadyOnly={handleExportReadyOnly}
        onExportWithoutErrors={handleExportWithoutErrors}
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
        {/* колонка маркера валидации — заголовок не влезает, смысл даёт цвет */}
        <span aria-label="Status" />
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
          <span>{selectedCount} selected for export</span>
          {validationFilter && (
            <span className={styles.footerHint}>
              {visibleSelectedCount} of {visibleJobs.length} in this group
            </span>
          )}
          {visibleSelectedCount < visibleJobs.length && (
            <button
              className={styles.selectAll}
              onClick={() => handleCheckAll(true)}
            >
              {validationFilter
                ? `Select all ${visibleJobs.length} in this group`
                : `Select all ${visibleJobs.length}`}
            </button>
          )}
        </div>

        {/* Pagination — компонент сам скрывается, если страница одна */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </Panel>
  );
};
