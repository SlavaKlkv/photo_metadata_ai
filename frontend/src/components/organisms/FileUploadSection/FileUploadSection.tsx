// FileUploadSection organism component
import React, { useRef, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { useUIStore } from "../../../store/useUIStore";
import { useToastStore } from "../../../store/useToastStore";
import apiClient from "../../../services/api/api";
import { Icon } from "../../atoms/Icon/Icon";
import { InfoCard } from "../../molecules/InfoCard/InfoCard";
import { Panel } from "../../atoms/Panel/Panel";
import styles from "./FileUploadSection.module.scss";
import { SectionHeader } from "../../molecules/SectionHeader/SectionHeader";

const ALLOWED_FORMATS = ["image/jpeg", "image/png"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const FileUploadSection: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const addJobs = useAppStore((state) => state.addJobs);
  const jobsCount = useAppStore((state) => state.jobs.length);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);
  const addToast = useToastStore((state) => state.addToast);
  const [isUploading, setIsUploading] = useState(false);
  const addPreviews = useAppStore((state) => state.addPreviews);
  const draftBatchSettings = useAppStore((state) => state.draftBatchSettings);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return { valid: false, error: `Формат не поддержан: ${file.type}` };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
      };
    }

    return { valid: true };
  };

  const createJobs = (files: File[], fileIds: string[]) => {
    return files.map((file, index) => {
      const validation = validateFile(file);
      return {
        id: fileIds[index] ?? `${Date.now()}-${Math.random()}`,
        filename: file.name,
        originalFilename: file.name,
        status: validation.valid ? ("queued" as const) : ("error" as const),
        error: validation.error,
        metadata: undefined,
      };
    });
  };

  const uploadFiles = async (files: File[]) => {
    const validFiles = files.filter((file) => validateFile(file).valid);
    const invalidFiles = files.filter((file) => !validateFile(file).valid);

    if (invalidFiles.length > 0) {
      invalidFiles.forEach((file) => {
        const error = validateFile(file).error ?? "Invalid file";
        addToast(`${file.name}: ${error}`, "error");
      });
    }

    if (validFiles.length === 0) return;

    const formData = new FormData();
    validFiles.forEach((file) => formData.append("files", file));
    if (draftBatchSettings.shootingContext) {
      formData.append("shooting_context", draftBatchSettings.shootingContext);
    }

    try {
      setIsUploading(true);
      const response = await apiClient.post<{
        job_id: string;
        files: Array<{ file_id: string }>;
      }>("/api/v1/jobs/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const previewMap: Record<string, string> = {};
      response.data.files.forEach((f: { file_id: string }, index: number) => {
        // порядок сохраняется — маппим по индексу
        previewMap[f.file_id] = URL.createObjectURL(validFiles[index]);
      });
      addPreviews(previewMap);

      const fileIds = response.data.files.map((f) => f.file_id);
      const jobs = createJobs(validFiles, fileIds);
      addJobs(jobs);
      setCurrentJobId(response.data.job_id);
      setIsUploaded(true);
      // убрали: openProgressModal() и setIsProcessing()
      addToast(`${jobs.length} files ready for processing`, "success");
    } catch (error) {
      addToast("Upload failed. Please try again.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    uploadFiles(files);
  };

  const hasUploads = jobsCount > 0;
  const headline = hasUploads
    ? `${jobsCount} photos uploaded successfully!`
    : "Drag & drop photos here";
  const description = hasUploads
    ? "Ready for AI processing"
    : "or click to browse";
  const metadataHint = isUploading
    ? "This may take a moment."
    : hasUploads
      ? "You can add more photos"
      : "Upload JPG or PNG photos to begin";
  const iconName = hasUploads ? "img-modal-icon" : "img-icon";

  const cards = [
    {
      icon: <Icon name="meta-icon" className={styles.cardIcon} />,
      title: "AI-Powered Metadata",
      description:
        "Our AI analyzes each photo and generates accurate, stock-ready metadata.",
    },
    {
      icon: <Icon name="load-icon" className={styles.cardIcon} />,
      title: "Stock-Optimized",
      description:
        "Our AI analyzes each photo and generates accurate, stock-ready metadata.",
    },
    {
      icon: <Icon name="doc-icon" className={styles.cardIcon} />,
      title: "IPTC & CSV Export",
      description:
        "Embed IPTC metadata into files and export CSV for seamless platform uploads.",
    },
    {
      icon: <Icon name="clock-icon" className={styles.cardIcon} />,
      title: "Save Hours of Work",
      description:
        "Process hundreds of photos in minutes and focus on what you do best.",
    },
  ];

  return (
    <Panel className={styles.panel}>
      <section className={styles.container}>
        <SectionHeader
          icon="folder-icon"
          title="Upload Photos"
          subtitle="Start by adding your photos. We'll take care of the rest."
        />

        <div
          className={`${styles.uploadArea} ${dragActive ? styles.active : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name={iconName} className={styles.uploadIcon} />
          <div className={styles.uploadText}>
            <h3>{headline}</h3>
            <p>{description}</p>
            <span>{metadataHint}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_FORMATS.join(",")}
            onChange={handleChange}
            className={styles.input}
          />
        </div>

        <div className={styles.cardsGrid}>
          {cards.map((card) => (
            <InfoCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              description={card.description}
            />
          ))}
        </div>
      </section>
    </Panel>
  );
};
