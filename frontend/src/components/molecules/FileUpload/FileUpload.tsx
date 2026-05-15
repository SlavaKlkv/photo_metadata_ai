// FileUpload (Drop zone) molecule component

import React, { useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import styles from './FileUpload.module.scss';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const FileUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const addJobs = useAppStore((state) => state.addJobs);
  const jobs = useAppStore((state) => state.jobs);
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const addToast = useUIStore((state) => state.addToast);
  
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
  
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const jobs = filesToJobs(files);
    
    if (jobs.length > 0) {
      addJobs(jobs);
      openProgressModal(); // Открываем modal сразу!
      addToast(`Загружено ${jobs.length} файлов`, 'info');
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    const jobs = filesToJobs(files);
    
    if (jobs.length > 0) {
      addJobs(jobs);
      openProgressModal();
      addToast(`Загружено ${jobs.length} файлов`, 'info');
    }
  };
  
  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropZone} ${dragActive ? styles.active : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={styles.content}>
          <span className={styles.icon}>📸</span>
          <h3>Перетащи фото сюда</h3>
          <p>или нажми чтобы выбрать</p>
          <span className={styles.format}>JPG, PNG • Max 50MB каждый</span>
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
    </div>
  );
};