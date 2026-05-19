// frontend/src/components/organisms/ExportModal/ExportModal.tsx
import React, { useEffect, useState } from 'react';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useUIStore } from '../../../store/useUIStore';
import { useAppStore } from '../../../store/useAppStore';
import { jobsApi } from '../../../services/api/api';
import styles from './ExportModal.module.scss';

export const ExportModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isExportModalOpen);
  const closeExportModal = useUIStore((state) => state.closeExportModal);
  const openSuccessModal = useUIStore((state) => state.openSuccessModal);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const jobs = useAppStore((state) => state.jobs);

  const [progress, setProgress] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentJobId) return;

    setProgress(0);
    setIsCancelled(false);

    // анимируем прогресс до 90% пока идёт запрос
    const fakeInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(fakeInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    const doExport = async () => {
      try {
        // 1. запускаем экспорт
        await jobsApi.startExport(currentJobId, "csv");

        // 2. скачиваем файл
        const response = await jobsApi.downloadExport(currentJobId, "csv");

        if (isCancelled) return;

        const blob = new Blob([response.data], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `metadata_export_${currentJobId}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        clearInterval(fakeInterval);
        setProgress(100);

        setTimeout(() => {
          closeExportModal();
          openSuccessModal();
        }, 500);
      } catch (error) {
        clearInterval(fakeInterval);
        closeExportModal();
      }
    };

    doExport();

    return () => {
      clearInterval(fakeInterval);
    };
  }, [isOpen]);

  const handleCancel = () => {
    setIsCancelled(true);
    closeExportModal();
  };

  const total = jobs.length;
  const current = Math.round((progress / 100) * total);

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} closeOnBackdrop={false}>
      <div className={styles.content}>
        <div className={styles.row}>
          <p className={styles.label}>Exporting: {current}/{total}</p>
          <Button variant="secondary" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <ProgressBar value={progress} animated={progress < 100} />
      </div>
    </Modal>
  );
};