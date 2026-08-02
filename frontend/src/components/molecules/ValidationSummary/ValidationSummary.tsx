// frontend/src/components/molecules/ValidationSummary/ValidationSummary.tsx
import React from 'react';
import {
  ValidationGroup,
  VALIDATION_GROUPS,
  VALIDATION_GROUP_HINTS,
  VALIDATION_GROUP_LABELS,
} from 'utils/validationGroups';
import styles from './ValidationSummary.module.scss';

interface ValidationSummaryProps {
  counts: Record<ValidationGroup, number>;
  activeGroup: ValidationGroup | null;
  totalCount: number;
  readyCount: number;
  // готовые + с рекомендациями: всё, что вообще можно экспортировать
  exportableCount: number;
  isApplyingSelection?: boolean;
  isRetryingFailed?: boolean;
  onSelectGroup: (group: ValidationGroup | null) => void;
  onRetryFailed: () => void;
  onExportReadyOnly: () => void;
  onExportWithoutErrors: () => void;
}

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  counts,
  activeGroup,
  totalCount,
  readyCount,
  exportableCount,
  isApplyingSelection = false,
  isRetryingFailed = false,
  onSelectGroup,
  onRetryFailed,
  onExportReadyOnly,
  onExportWithoutErrors,
}) => {
  if (totalCount === 0) return null;

  // Без предупреждений «всё без ошибок» — это ровно готовые файлы,
  // вторая кнопка была бы дубликатом первой.
  const showExportWithoutErrors = counts.warnings > 0;

  return (
    <div className={styles.summary}>
      <div className={styles.groups} role="group" aria-label="Validation summary">
        <button
          type="button"
          className={`${styles.chip} ${activeGroup === null ? styles.chipActive : ''}`}
          aria-pressed={activeGroup === null}
          aria-label={`All (${totalCount})`}
          onClick={() => onSelectGroup(null)}
        >
          <span className={styles.chipLabel}>All</span>
          <span className={styles.chipCount}>{totalCount}</span>
        </button>

        {VALIDATION_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            className={`${styles.chip} ${styles[group]} ${
              activeGroup === group ? styles.chipActive : ''
            }`}
            aria-pressed={activeGroup === group}
            aria-label={`${VALIDATION_GROUP_LABELS[group]} (${counts[group]})`}
            title={VALIDATION_GROUP_HINTS[group]}
            disabled={counts[group] === 0}
            // повторный клик по активной группе — возврат ко «всем»
            onClick={() => onSelectGroup(activeGroup === group ? null : group)}
          >
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.chipLabel}>
              {VALIDATION_GROUP_LABELS[group]}
            </span>
            <span className={styles.chipCount}>{counts[group]}</span>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        {/* Повтор упавших файлов: перезапускает разом все failed файлы
            задачи, а не выбранные, — поэтому счётчик в подписи. */}
        {counts.failed > 0 && (
          <button
            type="button"
            className={styles.retryAction}
            disabled={isRetryingFailed}
            title="Process every file that failed again, without re-running the whole batch"
            onClick={onRetryFailed}
          >
            {isRetryingFailed
              ? 'Retrying...'
              : `Retry failed (${counts.failed})`}
          </button>
        )}

        {showExportWithoutErrors && (
          <button
            type="button"
            className={styles.exportAction}
            disabled={exportableCount === 0 || isApplyingSelection}
            title={
              exportableCount === 0
                ? 'No files without validation errors'
                : 'Keep every file without validation errors selected for export'
            }
            onClick={onExportWithoutErrors}
          >
            {isApplyingSelection
              ? 'Selecting...'
              : `Select without errors (${exportableCount})`}
          </button>
        )}

        {/* Готовых файлов нет — выбирать нечего, кнопку не показываем */}
        {readyCount > 0 && (
          <button
            type="button"
            className={styles.exportAction}
            disabled={isApplyingSelection}
            title="Keep only fully ready files selected for export"
            onClick={onExportReadyOnly}
          >
            {isApplyingSelection
              ? 'Selecting...'
              : `Select ready only (${readyCount})`}
          </button>
        )}
      </div>
    </div>
  );
};
