// FileUploadSection organism component
import React, { useRef, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';
import { useToastStore } from '../../../store/useToastStore';
import { Icon } from '../../atoms/Icon/Icon';
import { InfoCard } from '../../molecules/InfoCard/InfoCard';
import { Panel } from '../../atoms/Panel/Panel';
import styles from './FileUploadSection.module.scss';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const FileUploadSection: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const addJobs = useAppStore((state) => state.addJobs);
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const addToast = useToastStore((state) => state.addToast);

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return { valid: false, error: `Формат не поддержан: ${file.type}` };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }

    return { valid: true };
  };

  const filesToJobs = (files: File[]) => {
    return files.map((file) => {
      const validation = validateFile(file);
      return {
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        originalFilename: file.name,
        status: validation.valid ? ('queued' as const) : ('error' as const),
        error: validation.error,
        metadata: undefined,
      };
    });
  };

  const processFiles = (files: File[]) => {
    const jobs = filesToJobs(files);
    const queuedJobs = jobs.filter((job) => job.status === 'queued');

    if (jobs.length === 0) {
      return;
    }

    addJobs(jobs);
    openProgressModal();

    if (queuedJobs.length > 0) {
      setUploadedCount((count) => count + queuedJobs.length);
      addToast(`Загружено ${queuedJobs.length} файлов`, 'info');
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    processFiles(files);
  };

  const hasUploads = uploadedCount > 0;
  const headline = hasUploads ? `${uploadedCount} photos uploaded successfully!` : 'Drag & drop photos here';
  const description = hasUploads ? 'Ready for AI processing' : 'or click to browse';
  const metadataHint = hasUploads ? 'You can add more photos' : 'Upload 50+ JPG, PNG or RAW photos to begin';
  const iconName = hasUploads ? 'img-modal-icon' : 'img-icon';

  const cards = [
    {
      icon: <Icon name="meta-icon" className={styles.cardIcon} />,
      title: 'AI-Powered Metadata',
      description: 'Our AI analyzes each photo and generates accurate, stock-ready metadata.',
    },
    {
      icon: <Icon name="load-icon" className={styles.cardIcon} />,
      title: 'Stock-Optimized',
      description: 'Our AI analyzes each photo and generates accurate, stock-ready metadata.',
    },
    {
      icon: <Icon name="doc-icon" className={styles.cardIcon} />,
      title: 'IPTC & CSV Export',
      description: 'Embed IPTC metadata into files and export CSV for seamless platform uploads.',
    },
    {
      icon: <Icon name="clock-icon" className={styles.cardIcon} />,
      title: 'Save Hours of Work',
      description: 'Process hundreds of photos in minutes and focus on what you do best.',
    },
  ];

  return (
    <Panel className={styles.panel}>
      <section className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>
            <Icon name="folder-icon" className={styles.folderIcon} />
          </div>
          <div>
            <h2>Upload Photos</h2>
            <p>Start by adding your photos. We’ll take care of the rest.</p>
          </div>
        </div>

        <div
          className={`${styles.uploadArea} ${dragActive ? styles.active : ''}`}
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
            accept={ALLOWED_FORMATS.join(',')}
            onChange={handleChange}
            className={styles.input}
          />
        </div>

        <div className={styles.cardsGrid}>
          {cards.map((card) => (
            <InfoCard key={card.title} icon={card.icon} title={card.title} description={card.description} />
          ))}
        </div>
      </section>
    </Panel>
  );
};
