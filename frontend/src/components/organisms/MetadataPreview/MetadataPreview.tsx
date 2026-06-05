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

// Вспомогательный компонент для редактируемого поля метаданных
interface MetadataFieldProps {
  fieldKey: string;
  label: string;
  value: string;
  isEdited?: boolean;
  jobId: string;
  currentJobId: string | null;
}

const MetadataField: React.FC<MetadataFieldProps> = ({
  fieldKey,
  label,
  value,
  isEdited,
  jobId,
  currentJobId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const updateMetadata = useAppStore((state) => state.updateMetadata);
  const addToast = useToastStore((state) => state.addToast);

  // синхронизируем если value пришёл новый (смена стока)
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (!currentJobId) return;

    try {
      await jobsApi.updateMetadata(currentJobId, jobId, {
        [fieldKey]: editValue,
      });

      // обновляем legacy metadata для title/description/keywords
      addToast("Saved", "success");
    } catch {
      addToast("Failed to save", "error");
    }

    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) handleSave();

    if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  return (
    <div className={styles.field}>
      <span
        className={`${styles.fieldLabel} ${isEdited ? styles.fieldEdited : ""}`}
      >
        {label}
      </span>

      {isEditing ? (
        <textarea
          autoFocus
          className={styles.fieldTextarea}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
        />
      ) : (
        <div
          className={styles.fieldValue}
          onDoubleClick={() => setIsEditing(true)}
          title="Double-click to edit"
        >
          {value || "—"}
          <Icon name="edit-icon" className={styles.editIcon} />
        </div>
      )}
    </div>
  );
};

export const MetadataPreview: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const updateMetadata = useAppStore((state) => state.updateMetadata);
  const regenerateFile = useAppStore((state) => state.regenerateFile);
  const regeneratingFileId = useAppStore((state) => state.regeneratingFileId);
  const lockedBatchSettings = useAppStore((state) => state.lockedBatchSettings);

  const stockOptions = useAppStore((state) => state.stockOptions);

  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const addToast = useToastStore((state) => state.addToast);
  const previews = useAppStore((state) => state.previews);

  const doneJobs = jobs.filter((j) => j.status === "done");
  const currentIndex = doneJobs.findIndex((j) => j.id === selectedJobId);
  const job = doneJobs.find((j) => j.id === selectedJobId);

  // локальный стейт для редактирования
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    title: "",
    description: "",
    keywords: "",
  });

  // навигация — ввод номера вручную
  const [indexInput, setIndexInput] = useState<string | null>(null);

  // синхронизируем editValues когда меняется выбранный job
  useEffect(() => {
    if (job?.metadata) {
      setEditValues({
        title: job.metadata.title ?? "",
        description: job.metadata.description ?? "",
        keywords: job.metadata.keywords?.join(", ") ?? "",
      });
    }
    setEditingField(null);
  }, [job?.id]);

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

  const handleSave = async (field: "title" | "description" | "keywords") => {
    if (!job || !currentJobId) return;

    const updatedMetadata = {
      ...job.metadata,
      [field]:
        field === "keywords"
          ? editValues.keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
          : editValues[field],
    };

    try {
      await jobsApi.updateMetadata(currentJobId, job.id, updatedMetadata);
      updateMetadata(job.id, updatedMetadata as any);
      addToast("Saved", "success");
    } catch {
      addToast("Failed to save", "error");
    }

    setEditingField(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: "title" | "description" | "keywords",
  ) => {
    if (e.key === "Enter" && !e.shiftKey) handleSave(field);
    if (e.key === "Escape") setEditingField(null);
  };

  // Regenerate использует lockedBatchSettings — оригинальные настройки batch,
  // а не текущий draft. Это гарантирует воспроизводимость результата.
  const handleRegenerate = async () => {
    if (!job || !currentJobId) return;

    const result = await regenerateFile(job.id, currentJobId);

    if (result.success) {
      addToast("Metadata regenerated", "success");
    } else {
      addToast(result.error ?? "Failed to regenerate", "error");
    }
  };

  const isRegenerating = regeneratingFileId === job?.id;
  // Regenerate доступен только когда batch зафиксирован (после processing)
  const canRegenerate = !!lockedBatchSettings && !!currentJobId;

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

      {/* Превью фото */}
      <div className={styles.imagePlaceholder}>
        {previews[job.id] ? (
          <img
            src={previews[job.id]}
            alt={job.originalFilename}
            className={styles.previewImage}
          />
        ) : (
          <Icon name="img-icon" className={styles.imagePlaceholderIcon} />
        )}
      </div>

      {/* Filename */}
      <div className={styles.filename}>{job.originalFilename}</div>

      {/* Поля метаданных */}
      <div className={styles.fields}>
        {/* common_fields — всегда показываем */}
        {job.preview?.common_fields.map((field) => (
          <MetadataField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            value={field.value}
            isEdited={job.edited_fields?.includes(field.key)}
            jobId={job.id}
            currentJobId={currentJobId}
          />
        ))}

        {/* stock_specific.fields — только для выбранного стока */}
        {job.preview?.stock_specific.fields.map((field) => (
          <MetadataField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            value={field.value}
            isEdited={job.edited_fields?.includes(field.key)}
            jobId={job.id}
            currentJobId={currentJobId}
          />
        ))}

        {/* Ошибки и предупреждения */}
        {job.preview?.errors.map((err) => (
          <div key={err.code} className={styles.validationError}>
            <Icon name="error-icon" className={styles.validationIcon} />
            <span>{err.message}</span>
          </div>
        ))}
        {job.preview?.warnings.map((warn) => (
          <div key={warn.code} className={styles.validationWarning}>
            <Icon name="info-icon" className={styles.validationIcon} />
            <span>{warn.message}</span>
          </div>
        ))}
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
