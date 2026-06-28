// frontend/src/components/organisms/MetadataPreview/MetadataPreview.tsx
import React, { useState, useEffect } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { useUIStore } from "../../../store/useUIStore";
import { useToastStore } from "../../../store/useToastStore";
import { jobsApi } from "../../../services/api/api";
import { Button } from "../../atoms/Button/Button";
import { Icon } from "../../atoms/Icon/Icon";
import { Panel } from "../../atoms/Panel/Panel";
import styles from "./MetadataPreview.module.scss";
import { SectionHeader } from "../../molecules/SectionHeader/SectionHeader";
import { Input } from "../../atoms/Input/Input";
import { FilePreview } from "../../../types";

interface MetadataSaveResult {
  file_id: string;
  title?: string;
  description?: string;
  keywords?: string[];
  preview?: FilePreview;
}

// Вспомогательный компонент для редактируемого поля метаданных
interface MetadataFieldProps {
  fieldKey: string;
  label: string;
  value: string | string[];
  isEdited?: boolean;
  jobId: string;
  currentJobId: string | null;
  errors?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
  onSaved: (result: MetadataSaveResult) => void;
}

const MetadataField: React.FC<MetadataFieldProps> = ({
  fieldKey,
  label,
  value,
  isEdited,
  jobId,
  currentJobId,
  errors = [],
  warnings = [],
  onSaved,
}) => {
  const isArray = Array.isArray(value);
  const stringValue = isArray ? value.join(", ") : String(value || "");
  const [editValue, setEditValue] = useState(stringValue);
  const hasChanged = editValue !== stringValue;

  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    setEditValue(stringValue);
  }, [stringValue, fieldKey]);

  const handleSave = async () => {
    if (!currentJobId) return;

    try {
      // если было массивом — парсим обратно в массив
      const saveValue = isArray
        ? editValue.split(",").map(k => k.trim()).filter(Boolean)
        : editValue;

      const response = await jobsApi.updateMetadata(currentJobId, jobId, {
        [fieldKey]: saveValue,
      });

      onSaved(response.data);
      addToast("Saved", "success");
    } catch {
      addToast("Failed to save", "error");
    }
  };

  return (
    <div className={styles.fieldWrapper}>
      <div className={styles.field}>
        <label className={`${styles.fieldLabel} ${isEdited ? styles.fieldEdited : ""}`}>
          {label}
        </label>

        {/* Input это textarea — используем везде */}
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          hasError={errors.length > 0}
          variant="metadata"
        />
      </div>

      {/* Валидация под полем */}
      {!hasChanged && errors.length > 0 && (
        <div className={styles.fieldValidation}>
          {errors.map((err) => (
            <div key={err.code} className={styles.validationError}>
              <Icon name="error-icon" className={styles.validationIcon} />
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {!hasChanged && warnings.length > 0 && (
        <div className={styles.fieldValidation}>
          {warnings.map((warn) => (
            <div key={warn.code} className={styles.validationWarning}>
              <Icon name="info-icon" className={styles.validationIcon} />
              <span>{warn.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const MetadataPreview: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const regenerateFile = useAppStore((state) => state.regenerateFile);
  const regeneratingFileId = useAppStore((state) => state.regeneratingFileId);
  const lockedBatchSettings = useAppStore((state) => state.lockedBatchSettings);
  const updateJobPreview = useAppStore((state) => state.updateJobPreview);
  const updateMetadata = useAppStore((state) => state.updateMetadata);
  const sessionSettings = useAppStore((state) => state.sessionSettings);

  const stockOptions = useAppStore((state) => state.stockOptions);

  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const addToast = useToastStore((state) => state.addToast);
  const previews = useAppStore((state) => state.previews);

  const doneJobs = jobs.filter((j) => j.status === "done");
  const currentIndex = doneJobs.findIndex((j) => j.id === selectedJobId);
  const job = doneJobs.find((j) => j.id === selectedJobId);

  // навигация — ввод номера вручную
  const [indexInput, setIndexInput] = useState<string | null>(null);

  // выбираем первый completed job автоматически
  useEffect(() => {
    if (!selectedJobId && doneJobs.length > 0) {
      setSelectedJobId(doneJobs[0].id);
    }
  }, [doneJobs, selectedJobId]);

  const handleNavigate = (direction: "prev" | "next") => {
    if (doneJobs.length === 0) return;
    const newIndex =
      direction === "prev"
        ? Math.max(0, currentIndex - 1)
        : Math.min(doneJobs.length - 1, currentIndex + 1);
    setSelectedJobId(doneJobs[newIndex].id);
  };

  const handleIndexSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && indexInput !== null) {
      const num = parseInt(indexInput, 10);
      if (!isNaN(num) && num >= 1 && num <= doneJobs.length) {
        setSelectedJobId(doneJobs[num - 1].id);
      }
      setIndexInput(null);
    }
    if (e.key === "Escape") setIndexInput(null);
  };

  // Regenerate использует lockedBatchSettings — оригинальные настройки batch,
  // а не текущий draft. Это гарантирует воспроизводимость результата.
  const handleRegenerate = async () => {
    if (!job || !currentJobId || !lockedBatchSettings) return;

    // провайдер ОБЯЗАТЕЛЕН
    if (!sessionSettings.selectedProvider) {
      addToast("AI provider not selected", "error");
      return;
    }

    try {
      const response = await jobsApi.regenerateFile(currentJobId, job.id, {
        shooting_context: lockedBatchSettings.shootingContext,
        stock_platform: lockedBatchSettings.stockPlatform,
        ai_provider: sessionSettings.selectedProvider,
      });

      const newMetadata = response.data.metadata;

      // обновляем preview и metadata в store
      if (newMetadata.preview) {
        updateJobPreview(job.id, newMetadata.preview);
      }

      // обновляем legacy metadata
      updateMetadata(job.id, {
        title: newMetadata.title ?? "",
        description: newMetadata.description ?? "",
        keywords: newMetadata.keywords ?? [],
      });

      addToast("Metadata regenerated", "success");
    } catch (error) {
      addToast("Failed to regenerate", "error");
      console.error("[Regenerate error]:", error);
    }
  };

  const isRegenerating = regeneratingFileId === job?.id;
  // Regenerate доступен только когда batch зафиксирован (после processing)
  const canRegenerate = !!lockedBatchSettings && !!currentJobId;

  const handleMetadataSaved = (result: MetadataSaveResult) => {
    if (result.preview) {
      updateJobPreview(result.file_id, result.preview);
    }

    updateMetadata(result.file_id, {
      title: result.title ?? "",
      description: result.description ?? "",
      keywords: result.keywords ?? [],
    });
  };

  if (!job) {
    return (
      <Panel className={styles.panel}>
        <p className={styles.empty}>Select a photo to preview metadata</p>
      </Panel>
    );
  }

  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <Panel className={styles.panel} direction="column" gap="md">
      {/* Заголовок */}
      <SectionHeader
        icon="info-icon"
        title="Metadata Preview"
        subtitle="Upload photos and set context to see AI-generated metadata."
      />

      {/* Навигация */}
      <div className={styles.nav}>
        <button
          className={styles.navBtn}
          onClick={() => handleNavigate("prev")}
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
        <div className={styles.filename}>{job.originalFilename}</div>

        {/* Поля метаданных */}
        <div className={styles.fields}>
          {/* common_fields — всегда показываем */}
          {job.preview?.common_fields.map((field) => {
            const fieldErrors =
              job.preview?.errors.filter((e) => e.field === field.key) || [];
            const fieldWarnings =
              job.preview?.warnings.filter((w) => w.field === field.key) || [];

            return (
              <MetadataField
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                value={field.value}
                isEdited={job.edited_fields?.includes(field.key)}
                jobId={job.id}
                currentJobId={currentJobId}
                errors={fieldErrors}
                warnings={fieldWarnings}
                onSaved={handleMetadataSaved}
              />
            );
          })}

          {/* stock_specific.fields — только для выбранного стока */}
          {job.preview?.stock_specific.fields.map((field) => {
            const fieldErrors =
              job.preview?.errors.filter((e) => e.field === field.key) || [];
            const fieldWarnings =
              job.preview?.warnings.filter((w) => w.field === field.key) || [];

            return (
              <MetadataField
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                value={field.value}
                isEdited={job.edited_fields?.includes(field.key)}
                jobId={job.id}
                currentJobId={currentJobId}
                errors={fieldErrors}
                warnings={fieldWarnings}
                onSaved={handleMetadataSaved}
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
