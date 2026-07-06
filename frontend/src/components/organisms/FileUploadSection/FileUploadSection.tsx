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

const ALLOWED_FORMATS = ["image/jpeg"];
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (бэкенд лимит)

export const FileUploadSection: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const existingJobs = useAppStore((state) => state.jobs);
  const addJobs = useAppStore((state) => state.addJobs);
  const jobsCount = useAppStore((state) => state.jobs.length);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const addToast = useToastStore((state) => state.addToast);
  const [isUploading, setIsUploading] = useState(false);
  const addPreviews = useAppStore((state) => state.addPreviews);
  const draftBatchSettings = useAppStore((state) => state.draftBatchSettings);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // проверяем MIME и расширение — MIME можно подделать, расширение — fallback
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    const validMime = ALLOWED_FORMATS.includes(file.type);
    const validExt = ALLOWED_EXTENSIONS.includes(ext);

    if (!validMime && !validExt) {
      return { valid: false, error: `Only JPEG files are supported` };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`,
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
        selected_for_export: true,
      };
    });
  };

  const uploadFiles = async (files: File[]) => {
    const validFiles = files.filter((file) => validateFile(file).valid);
    const invalidFiles = files.filter((file) => !validateFile(file).valid);
    const existingFilenames = new Set(
      existingJobs.map((job) => job.originalFilename.trim().toLowerCase()),
    );
    const selectedFilenames = new Set<string>();
    const uniqueFiles: File[] = [];
    const duplicateFiles: File[] = [];

    validFiles.forEach((file) => {
      const filenameKey = file.name.trim().toLowerCase();

      if (
        existingFilenames.has(filenameKey) ||
        selectedFilenames.has(filenameKey)
      ) {
        duplicateFiles.push(file);
        return;
      }

      selectedFilenames.add(filenameKey);
      uniqueFiles.push(file);
    });

    if (invalidFiles.length > 0) {
      addToast(
        `${invalidFiles.length} file${invalidFiles.length > 1 ? "s" : ""} skipped — only JPEG is supported`,
        "error",
      );
    }

    if (duplicateFiles.length > 0) {
      addToast(
        `${duplicateFiles.length} duplicate file${duplicateFiles.length > 1 ? "s" : ""} skipped`,
        "error",
      );
    }

    if (uniqueFiles.length === 0) return;

    const formData = new FormData();
    uniqueFiles.forEach((file) => formData.append("files", file));
    if (draftBatchSettings.shootingContext) {
      formData.append("shooting_context", draftBatchSettings.shootingContext);
    }
    if (currentJobId && !isProcessing && !isExportReady) {
      formData.append("job_id", currentJobId);
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
      const uploadedFiles = response.data.files.slice(-uniqueFiles.length);

      uploadedFiles.forEach((f: { file_id: string }, index: number) => {
        // порядок сохраняется — маппим по индексу
        previewMap[f.file_id] = URL.createObjectURL(uniqueFiles[index]);
      });
      addPreviews(previewMap);

      const fileIds = uploadedFiles.map((f) => f.file_id);
      const jobs = createJobs(uniqueFiles, fileIds);
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
  const headline = hasUploads ? (
    `${jobsCount} photos uploaded successfully!`
  ) : (
    "Drag & drop photos here"
  );
  const description = hasUploads ? (
    <span className={styles.placeholderText}>Ready for AI processing</span>
  ) : (
    <>
      <span className={styles.placeholderText}>or click to </span>
      <span className={styles.accentText}>browse</span>
    </>
  );
  const metadataHint = isUploading ? (
    <span className={styles.placeholderText}>This may take a moment.</span>
  ) : hasUploads ? (
    <span className={styles.placeholderText}>You can add more photos</span>
  ) : (
    <span className={styles.placeholderText}>Upload JPEG photos to begin</span>
  );
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
        "Tailor titles, keywords, and categories for stock marketplace requirements.",
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
            accept={[...ALLOWED_FORMATS, ...ALLOWED_EXTENSIONS].join(",")}
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
