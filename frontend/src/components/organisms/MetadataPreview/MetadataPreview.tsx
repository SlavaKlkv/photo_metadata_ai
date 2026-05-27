// frontend/src/components/organisms/MetadataPreview/MetadataPreview.tsx
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';
import { useToastStore } from '../../../store/useToastStore';
import { jobsApi } from '../../../services/api/api';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { Panel } from '../../atoms/Panel/Panel';
import styles from './MetadataPreview.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

export const MetadataPreview: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const updateMetadata = useAppStore((state) => state.updateMetadata);
  const selectedJobId = useUIStore((state) => state.selectedJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const addToast = useToastStore((state) => state.addToast);
  const previews = useAppStore((state) => state.previews);

  const doneJobs = jobs.filter((j) => j.status === "done");
  const currentIndex = doneJobs.findIndex((j) => j.id === selectedJobId);
  //const job = currentIndex >= 0 ? doneJobs[currentIndex] : doneJobs[0];
  const job = doneJobs.find((j) => j.id === selectedJobId); // может быть undefined, если выбран job с ошибкой или еще не выбран

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
        {(["title", "description", "keywords"] as const).map((field) => (
          <div key={field} className={styles.field}>
            <span className={styles.fieldLabel}>
              {field.charAt(0).toUpperCase() + field.slice(1)}
            </span>
            {editingField === field ? (
              field === "description" ? (
                <textarea
                  autoFocus
                  className={styles.fieldTextarea}
                  value={editValues[field]}
                  onChange={(e) =>
                    setEditValues((v) => ({ ...v, [field]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, field)}
                  onBlur={() => handleSave(field)}
                />
              ) : (
                <input
                  autoFocus
                  className={styles.fieldInput}
                  value={editValues[field]}
                  onChange={(e) =>
                    setEditValues((v) => ({ ...v, [field]: e.target.value }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, field)}
                  onBlur={() => handleSave(field)}
                />
              )
            ) : (
              <div
                className={styles.fieldValue}
                onDoubleClick={() => setEditingField(field)}
                title="Double-click to edit"
              >
                {field === "keywords"
                  ? job.metadata?.keywords?.join(", ") || "—"
                  : job.metadata?.[field] || "—"}
                <Icon name="edit-icon" className={styles.editIcon} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Regenerate — внизу (перенесли) 
      <Button
        variant="secondary"
        size="sm"
        icon={<Icon name="restart-icon" className={styles.btnIcon} />}
        onClick={() => addToast("Regenerate coming soon", "info")}
        className={styles.regenerateBtn}
      >
        Regenerate
      </Button>*/}
    </Panel>
  );
};