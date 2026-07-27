// frontend/src/components/organisms/MetadataPreview/MetadataPreview.tsx
import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "store/useAppStore";
import { useUIStore } from "store/useUIStore";
import { useToastStore } from "store/useToastStore";
import { jobsApi } from "services/api/api";
import { PreviewFieldValue, StockOptions, StockPlatform } from "types";
import { Button } from "../../atoms/Button/Button";
import { Icon } from "../../atoms/Icon/Icon";
import { Panel } from "../../atoms/Panel/Panel";
import styles from "./MetadataPreview.module.scss";
import { SectionHeader } from "../../molecules/SectionHeader/SectionHeader";
import { Input } from "../../atoms/Input/Input";
import { getResultsPageForIndex } from "constants/pagination";
import { getJobValidationGroup } from "utils/validationGroups";
type ValidationMessage = {
  field: string;
  code: string;
  message: string;
};

const BOOLEAN_METADATA_FIELDS = new Set([
  "is_editorial",
  "has_people",
  "model_release_available",
  "ai_generated_content_disclosure",
  "is_illustration",
  "mature_content",
  "iptc_embedded_metadata",
]);

const PHOTO_VALIDATION_FIELDS = new Set(["image", "photo", "file"]);

const getValidationDisplayField = (field: string) => {
  if (field === "model_release_available") return "releases";

  return field;
};

// Вспомогательный компонент для редактируемого поля метаданных
interface MetadataFieldProps {
  fieldKey: string;
  label: string;
  value: PreviewFieldValue;
  jobId: string;
  currentJobId: string | null;
  errors?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
  stockPlatform?: StockPlatform;
  stockOptions?: StockOptions | null;
  isRegenerating?: boolean;
  wasRegenerated?: boolean;
  fixedOptions?: string[];
}

const MetadataField: React.FC<MetadataFieldProps> = ({
  fieldKey,
  label,
  value,
  jobId,
  currentJobId,
  errors = [],
  warnings = [],
  stockPlatform,
  stockOptions = null,
  isRegenerating = false,
  wasRegenerated = false,
  fixedOptions = [],
}) => {
  const stringValue = getPreviewFieldStringValue(value);
  const [editValue, setEditValue] = useState(stringValue);
  const [hasUserChanged, setHasUserChanged] = useState(false);
  const baselineValueRef = useRef<PreviewFieldValue>(
    getMetadataSaveValue(fieldKey, stringValue, value),
  );
  // Правка считается «настоящей» только если меняется сохраняемое значение:
  // лишние пробелы не должны выглядеть как исправление метаданных.
  const hasChanged = !isPreviewFieldValueEqual(
    normalizePreviewFieldValue(getMetadataSaveValue(fieldKey, editValue, value)),
    normalizePreviewFieldValue(
      getMetadataSaveValue(fieldKey, stringValue, value),
    ),
  );

  const addToast = useToastStore((state) => state.addToast);
  const applyMetadataResult = useAppStore(
    (state) => state.applyMetadataResult,
  );
  const isBoolean =
    typeof value === "boolean" || BOOLEAN_METADATA_FIELDS.has(fieldKey);
  const hasFixedOptions = fixedOptions.length > 0;
  const selectOptions = buildFixedSelectOptions(fixedOptions, stringValue);
  const inputClassName = `${isRegenerating ? styles.fieldInputRegenerating : ""} ${
    wasRegenerated ? styles.fieldInputRegenerated : ""
  }`;

  const getKeywordsCount = (text: string) =>
    text
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean).length;

  const counterConfig = (() => {
    if (!stockOptions || !stockPlatform) return null;
    if (stockOptions.stock_platform !== stockPlatform) return null;

    if (fieldKey === "title") {
      return {
        count: editValue.length,
        limit: stockOptions.title_max_characters,
        unit: "characters",
      };
    }

    if (fieldKey === "description") {
      return {
        count: editValue.length,
        limit: stockOptions.description_max_characters,
        unit: "characters",
      };
    }

    if (fieldKey === "keywords") {
      return {
        count: getKeywordsCount(editValue),
        limit: stockOptions.keywords_max_count,
        unit: "words",
      };
    }

    return null;
  })();

  const counterExceeded =
    counterConfig !== null && counterConfig.count > counterConfig.limit;
  const isEdited =
    hasUserChanged &&
    !isPreviewFieldValueEqual(
      normalizePreviewFieldValue(
        getMetadataSaveValue(fieldKey, editValue, value),
      ),
      normalizePreviewFieldValue(baselineValueRef.current),
    );

  useEffect(() => {
    setEditValue(stringValue);
  }, [stringValue]);

  useEffect(() => {
    baselineValueRef.current = getMetadataSaveValue(
      fieldKey,
      stringValue,
      value,
    );
    setHasUserChanged(false);
  }, [jobId, fieldKey]);

  const handleSave = async (nextEditValue = editValue) => {
    if (!currentJobId || isRegenerating) return;

    try {
      const saveValue = getMetadataSaveValue(
        fieldKey,
        nextEditValue,
        value,
      );
      const currentSaveValue = getMetadataSaveValue(
        fieldKey,
        stringValue,
        value,
      );

      if (
        isPreviewFieldValueEqual(
          normalizePreviewFieldValue(saveValue),
          normalizePreviewFieldValue(currentSaveValue),
        )
      ) {
        setHasUserChanged(
          !isPreviewFieldValueEqual(
            currentSaveValue,
            baselineValueRef.current,
          ),
        );
        return;
      }

      const response = await jobsApi.updateMetadata(currentJobId, jobId, {
        [fieldKey]: saveValue,
        stock_platform: stockPlatform,
      });

      applyMetadataResult(jobId, response.data);
      setHasUserChanged(
        !isPreviewFieldValueEqual(saveValue, baselineValueRef.current),
      );
      addToast("Saved", "success");
    } catch {
      addToast("Failed to save", "error");
    }
  };

  return (
    <div
      className={`${styles.fieldWrapper} ${
        isRegenerating ? styles.fieldWrapperRegenerating : ""
      } ${wasRegenerated ? styles.fieldWrapperRegenerated : ""}`}
    >
      <div className={styles.field}>
        <label className={`${styles.fieldLabel} ${isEdited ? styles.fieldEdited : ""}`}>
          {label}
        </label>

        {isBoolean ? (
          <div
            className={`${styles.booleanControl} ${
              errors.length > 0 ? styles.booleanControlError : ""
            }`}
          >
            {[
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.booleanOption} ${
                  !isRegenerating && editValue === option.value
                    ? styles.booleanOptionActive
                    : ""
                }`}
                onClick={() => {
                  setEditValue(option.value);
                  setHasUserChanged(true);
                  handleSave(option.value);
                }}
                disabled={isRegenerating}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : hasFixedOptions ? (
          <div className={styles.selectWrapper}>
            <select
              value={isRegenerating ? "" : editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setHasUserChanged(true);
                handleSave(e.target.value);
              }}
              className={`${styles.select} ${
                errors.length > 0 ? styles.selectError : ""
              } ${inputClassName}`}
              disabled={isRegenerating}
            >
              <option value="">
                {isRegenerating ? "Regenerating..." : "Select..."}
              </option>
              {selectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Icon name="arrow-down" className={styles.selectIcon} />
          </div>
        ) : (
          <Input
            value={isRegenerating ? "" : editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setHasUserChanged(true);
            }}
            onBlur={() => handleSave()}
            hasError={errors.length > 0}
            variant="metadata"
            disabled={isRegenerating}
            placeholder={isRegenerating ? "Regenerating..." : undefined}
            className={inputClassName}
            counter={
              counterConfig
                ? `${counterConfig.count}/${counterConfig.limit} ${counterConfig.unit}`
                : undefined
            }
            counterError={counterExceeded}
          />
        )}
      </div>

      {/* Валидация под полем. Пока правка не сохранена, сообщения остаются
          видимыми, но помечаются как устаревшие — иначе любое изменение
          выглядит как исправление проблемы. */}
      {!isRegenerating && (errors.length > 0 || warnings.length > 0) && (
        <div
          className={`${styles.fieldValidation} ${
            hasChanged ? styles.fieldValidationStale : ""
          }`}
        >
          {errors.map((err, index) => (
            <div
              key={`${fieldKey}-${err.code}-${index}`}
              className={styles.validationError}
            >
              <Icon name="error-icon" className={styles.validationIcon} />
              <span>{err.message}</span>
            </div>
          ))}
          {warnings.map((warn, index) => (
            <div
              key={`${fieldKey}-${warn.code}-${index}`}
              className={styles.validationWarning}
            >
              <Icon name="info-icon" className={styles.validationIcon} />
              <span>{warn.message}</span>
            </div>
          ))}
          {hasChanged && (
            <div className={styles.validationStaleNote}>
              Validation is outdated — save the field to refresh it.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const isPreviewFieldValueEqual = (
  firstValue: PreviewFieldValue,
  secondValue: PreviewFieldValue,
) => {
  if (Array.isArray(firstValue) || Array.isArray(secondValue)) {
    if (!Array.isArray(firstValue) || !Array.isArray(secondValue)) {
      return false;
    }

    return (
      firstValue.length === secondValue.length &&
      firstValue.every((item, index) => item === secondValue[index])
    );
  }

  return firstValue === secondValue;
};

// Пробелы не меняют смысл значения (backend считает слова через split()),
// поэтому для сравнения схлопываем их.
const normalizePreviewFieldValue = (
  value: PreviewFieldValue,
): PreviewFieldValue => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim().replace(/\s+/g, " "));
  }

  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ");
  }

  return value;
};

const getPreviewFieldStringValue = (value: PreviewFieldValue) =>
  Array.isArray(value) ? value.join(", ") : value === null ? "" : String(value);

const getMetadataSaveValue = (
  fieldKey: string,
  editValue: string,
  originalValue: PreviewFieldValue,
) => {
  if (fieldKey === "categories") {
    const category = editValue.trim();
    return category ? [category] : [];
  }

  if (Array.isArray(originalValue)) {
    return editValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (
    typeof originalValue === "boolean" ||
    BOOLEAN_METADATA_FIELDS.has(fieldKey)
  ) {
    const normalizedValue = editValue.trim().toLowerCase();

    if (["true", "yes", "1"].includes(normalizedValue)) return true;
    if (["false", "no", "0", ""].includes(normalizedValue)) return false;
  }

  if (typeof originalValue === "number") {
    const normalizedValue = editValue.trim();

    return normalizedValue ? Number(normalizedValue) : null;
  }

  return editValue;
};

const getFixedFieldOptions = (
  fieldKey: string,
  stockOptions: StockOptions | null,
) => {
  if (!stockOptions) return [];

  if (fieldKey === "categories" || fieldKey === "category_2") {
    return stockOptions.categories;
  }

  if (fieldKey === "license_type") {
    return stockOptions.license_types;
  }

  return [];
};

const buildFixedSelectOptions = (options: string[], currentValue: string) => {
  const normalizedCurrentValue = currentValue.trim();
  const hasCurrentValue =
    normalizedCurrentValue.length > 0 &&
    !options.some((option) => option === normalizedCurrentValue);
  const visibleOptions = hasCurrentValue
    ? [normalizedCurrentValue, ...options]
    : options;

  return visibleOptions.map((option) => ({
    value: option,
    label: formatFixedOptionLabel(option),
  }));
};

const formatFixedOptionLabel = (value: string) =>
  value
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

export const MetadataPreview: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const regenerateFile = useAppStore((state) => state.regenerateFile);
  const regeneratingFileId = useAppStore((state) => state.regeneratingFileId);
  const lockedBatchSettings = useAppStore((state) => state.lockedBatchSettings);
  const isProcessing = useAppStore((state) => state.isProcessing);

  const stockOptions = useAppStore((state) => state.stockOptions);

  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const validationFilter = useUIStore((state) => state.validationFilter);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const setResultsPage = useUIStore((state) => state.setResultsPage);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const addToast = useToastStore((state) => state.addToast);
  const previews = useAppStore((state) => state.previews);

  const doneJobs = jobs.filter((j) => j.status === "done");
  const currentIndex = doneJobs.findIndex((j) => j.id === selectedJobId);
  const job = doneJobs.find((j) => j.id === selectedJobId);

  // навигация — ввод номера вручную
  const [indexInput, setIndexInput] = useState<string | null>(null);
  const [recentlyRegeneratedFileId, setRecentlyRegeneratedFileId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!recentlyRegeneratedFileId) return;

    const timeoutId = window.setTimeout(() => {
      setRecentlyRegeneratedFileId(null);
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [recentlyRegeneratedFileId]);

  // Выбор из превью двигает и таблицу: страница считается по позиции файла
  // в том же списке, который показывает ResultsTable, — с учётом фильтра
  // сводки. Если файл в текущий фильтр не попадает, страницу не трогаем:
  // прокручивать таблицу некуда.
  const selectJob = (id: string) => {
    setSelectedJobId(id);

    const tableJobs = validationFilter
      ? jobs.filter((j) => getJobValidationGroup(j) === validationFilter)
      : jobs;
    const tableIndex = tableJobs.findIndex((j) => j.id === id);

    if (tableIndex >= 0) setResultsPage(getResultsPageForIndex(tableIndex));
  };

  // выбираем первый completed job автоматически;
  // то же самое, если выбранный файл исчез из списка (новый батч, удаление)
  useEffect(() => {
    if (doneJobs.length === 0) return;

    const hasSelectedJob =
      !!selectedJobId && jobs.some((j) => j.id === selectedJobId);

    if (!hasSelectedJob) {
      selectJob(doneJobs[0].id);
    }
  }, [jobs, doneJobs, selectedJobId]);

  const handleNavigate = (direction: "prev" | "next") => {
    if (doneJobs.length === 0) return;
    const total = doneJobs.length;
    const step = direction === "prev" ? -1 : 1;
    const newIndex = (currentIndex + step + total) % total;
    selectJob(doneJobs[newIndex].id);
  };

  const handleIndexSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && indexInput !== null) {
      const num = parseInt(indexInput, 10);
      if (!isNaN(num) && num >= 1 && num <= doneJobs.length) {
        selectJob(doneJobs[num - 1].id);
      }
      setIndexInput(null);
    }
    if (e.key === "Escape") setIndexInput(null);
  };

  // Regenerate использует lockedBatchSettings — оригинальные настройки batch,
  // а не текущий draft. Это гарантирует воспроизводимость результата.
  const handleRegenerate = async () => {
    if (!job || !currentJobId || !lockedBatchSettings) return;

    const result = await regenerateFile(job.id, currentJobId);
    if (result.success) {
      setRecentlyRegeneratedFileId(job.id);
      addToast("Metadata regenerated", "success");
    } else {
      addToast(result.error ?? "Failed to regenerate", "error");
    }
  };

  const isRegenerating = regeneratingFileId === job?.id;
  const wasRegenerated = recentlyRegeneratedFileId === job?.id;
  // Regenerate доступен только когда batch зафиксирован (после processing)
  const canRegenerate =
    !!job &&
    job.status === "done" &&
    !!lockedBatchSettings &&
    !!currentJobId &&
    !isProcessing;

  if (!job) {
    return (
      <Panel className={styles.panel}>
        <p className={styles.empty}>Select a photo to preview metadata</p>
      </Panel>
    );
  }

  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 1;
  const previewFields = [
    ...(job.preview?.common_fields ?? []),
    ...(job.preview?.stock_specific.fields ?? []),
  ];
  const previewFieldKeys = new Set(previewFields.map((field) => field.key));
  const fieldErrors = job.preview?.errors ?? [];
  const fieldWarnings = job.preview?.warnings ?? [];
  const photoErrors = fieldErrors.filter(
    (error) =>
      PHOTO_VALIDATION_FIELDS.has(getValidationDisplayField(error.field)),
  );
  const photoWarnings = fieldWarnings.filter(
    (warning) =>
      PHOTO_VALIDATION_FIELDS.has(getValidationDisplayField(warning.field)),
  );

  const renderValidationMessages = (
    messages: ValidationMessage[],
    type: "error" | "warning",
  ) =>
    messages.map((message, index) => (
      <div
        key={`${message.field}-${message.code}-${index}`}
        className={
          type === "error"
            ? styles.validationError
            : styles.validationWarning
        }
      >
        <Icon
          name={type === "error" ? "error-icon" : "info-icon"}
          className={styles.validationIcon}
        />
        <span>{message.message}</span>
      </div>
    ));

  return (
    <Panel className={styles.panel} direction="column" gap="md">
      {/* Заголовок */}
      <SectionHeader
        icon="info-icon"
        title="Metadata Preview"
        subtitle="Review and edit AI-generated metadata before export."
      />

      {/* Навигация */}
      <div className={styles.nav}>
        <button
          className={styles.navBtn}
          onClick={() => handleNavigate("prev")}
          disabled={isRegenerating}
        >
          ‹
        </button>
        {indexInput !== null ? (
          <input
            autoFocus
            className={styles.indexInput}
            value={indexInput}
            onChange={(e) => setIndexInput(e.target.value)}
            onKeyDown={handleIndexSubmit}
            onBlur={() => setIndexInput(null)}
          />
        ) : (
          <span
            className={styles.navCount}
            onClick={() => setIndexInput(String(displayIndex))}
            title="Click to jump to file"
          >
            {displayIndex} of {doneJobs.length}
          </span>
        )}
        <button
          className={styles.navBtn}
          onClick={() => handleNavigate("next")}
          disabled={isRegenerating}
        >
          ›
        </button>
      </div>

      <div className={styles.scrollableContent}>
        {/* Превью фото */}
        <div className={styles.imagePlaceholder}>
          {previews[job.id] ? (
            <div className={styles.imageInner}>
              <img
                src={previews[job.id]}
                alt={job.originalFilename}
                className={styles.previewImage}
              />
            </div>
          ) : (
            <Icon name="img-icon" className={styles.imagePlaceholderIcon} />
          )}
        </div>

        {/* Filename */}
        <div className={styles.filename} title={job.originalFilename}>
          {job.originalFilename}
        </div>

        {(photoErrors.length > 0 || photoWarnings.length > 0) && (
          <div className={styles.photoValidation}>
            {renderValidationMessages(photoErrors, "error")}
            {renderValidationMessages(photoWarnings, "warning")}
          </div>
        )}

        {/* Поля метаданных */}
        <div className={styles.fields}>
          {/* common_fields — всегда показываем */}
          {job.preview?.common_fields
            .filter((field) => field.key !== "filename")
            .map((field) => {
            const errors =
              job.preview?.errors.filter(
                (error) => getValidationDisplayField(error.field) === field.key,
              ) ?? [];
            const warnings =
              job.preview?.warnings.filter(
                (warning) =>
                  getValidationDisplayField(warning.field) === field.key,
              ) ?? [];

            return (
              <MetadataField
                key={`${job.id}:${field.key}`}
                fieldKey={field.key}
                label={field.label}
                value={field.value}
                jobId={job.id}
                currentJobId={currentJobId}
                errors={errors}
                warnings={warnings}
                stockPlatform={job.preview?.stock_platform}
                stockOptions={stockOptions}
                isRegenerating={isRegenerating}
                wasRegenerated={wasRegenerated}
                fixedOptions={getFixedFieldOptions(field.key, stockOptions)}
              />
            );
          })}

          {/* stock_specific.fields — только для выбранного стока */}
          {job.preview?.stock_specific.fields.map((field) => {
            const errors =
              job.preview?.errors.filter(
                (error) => getValidationDisplayField(error.field) === field.key,
              ) ?? [];
            const warnings =
              job.preview?.warnings.filter(
                (warning) =>
                  getValidationDisplayField(warning.field) === field.key,
              ) ?? [];

            return (
              <MetadataField
                key={`${job.id}:${field.key}`}
                fieldKey={field.key}
                label={field.label}
                value={field.value}
                jobId={job.id}
                currentJobId={currentJobId}
                errors={errors}
                warnings={warnings}
                stockPlatform={job.preview?.stock_platform}
                stockOptions={stockOptions}
                isRegenerating={isRegenerating}
                wasRegenerated={wasRegenerated}
                fixedOptions={getFixedFieldOptions(field.key, stockOptions)}
              />
            );
          })}
        </div>
      </div>

      {/* Regenerate — активен только после processing, использует locked settings */}
      <Button
        variant="secondary"
        size="sm"
        icon={<Icon name="restart-icon" className={styles.btnIcon} />}
        onClick={handleRegenerate}
        disabled={!canRegenerate || isRegenerating}
        title={
          !canRegenerate
            ? "Available after processing"
            : isRegenerating
              ? "Regenerating..."
              : "Regenerate using original batch settings"
        }
        className={styles.regenerateBtn}
      >
        {isRegenerating ? "Regenerating..." : "Regenerate"}
      </Button>
    </Panel>
  );
};
