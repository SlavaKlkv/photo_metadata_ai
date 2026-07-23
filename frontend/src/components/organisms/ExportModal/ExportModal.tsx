// frontend/src/components/organisms/ExportModal/ExportModal.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Modal } from '../../atoms/Modal/Modal';
import { ProgressBar } from '../../atoms/ProgressBar/ProgressBar';
import { Button } from '../../atoms/Button/Button';
import { useUIStore } from '../../../store/useUIStore';
import { useAppStore } from '../../../store/useAppStore';
import { jobsApi } from '../../../services/api/api';
import { useToastStore } from '../../../store/useToastStore';
import styles from './ExportModal.module.scss';

// Бэкенд отдаёт detail либо строкой, либо объектом с message и списком файлов
// (валидация метаданных). Без распаковки пользователь видел просто
// «Export failed» и не понимал, что именно чинить
class ExportFailedError extends Error {}

const describeExportError = (error: unknown): string => {
  // Сообщение, которое сервер прислал в export_error_message
  if (error instanceof ExportFailedError) return error.message;

  // Прочие ошибки (сеть, баг в коде) не показываем сырьём — их текст
  // пользователю ничего не говорит
  if (!axios.isAxiosError(error)) return "Export failed";

  const detail = error.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (detail && typeof detail === "object") {
    const message = (detail as { message?: string }).message ?? "Export failed";
    const files = (detail as { files?: { filename?: string }[] }).files ?? [];

    if (files.length > 0) {
      const names = files
        .slice(0, 3)
        .map((file) => file.filename)
        .filter(Boolean)
        .join(", ");
      const rest = files.length > 3 ? ` and ${files.length - 3} more` : "";

      return `${message} (${names}${rest})`;
    }

    return message;
  }

  return "Export failed";
};

export const ExportModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isExportModalOpen);
  const closeExportModal = useUIStore((state) => state.closeExportModal);
  const openSuccessModal = useUIStore((state) => state.openSuccessModal);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const jobs = useAppStore((state) => state.jobs);

  const exportFormats = useAppStore(
    (state) => state.draftBatchSettings.exportFormats,
  );
  const stockPlatform = useAppStore(
    (state) => state.draftBatchSettings.stockPlatform,
  );

  const setExportArtifacts = useUIStore((state) => state.setExportArtifacts);
  const setIsExporting = useUIStore((state) => state.setIsExporting);
  const addToast = useToastStore((state) => state.addToast);

  const [progress, setProgress] = useState(0);

  // Контроллер текущего экспорта: abort глушит и опрос, и паузу между опросами
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !currentJobId) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setProgress(0);

    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason ?? new Error("aborted"));
        });
      });

    const doExport = async () => {
      try {
        try {
          // Запуск намеренно без signal: оборвать его на клиенте нельзя —
          // сервер уже создал бы задачу, а мы бы об этом не узнали
          await jobsApi.startExport(currentJobId, {
            csv: exportFormats.csv,
            iptc: exportFormats.iptc,
            stock_platform: stockPlatform,
          });
        } catch (error) {
          // 409 — экспорт для этого джоба уже идёт (повторное открытие модалки
          // или двойной эффект). Второй задачи не создаётся, просто опрашиваем
          if (!axios.isAxiosError(error) || error.response?.status !== 409) {
            throw error;
          }
        }

        while (true) {
          const { data } = await jobsApi.getExportStatus(currentJobId, signal);

          if (signal.aborted) return;

          setProgress(data.export_progress);

          if (data.export_status === "completed") {
            setExportArtifacts(data.export_artifacts ?? []);
            break;
          }

          if (data.export_status === "failed") {
            throw new ExportFailedError(
              data.export_error_message || "Export failed",
            );
          }

          await sleep(1000);
        }

        setProgress(100);

        setTimeout(() => {
          closeExportModal();
          openSuccessModal();
        }, 500);
      } catch (error) {
        if (signal.aborted) return;
        setIsExporting(false);
        closeExportModal();
        addToast(describeExportError(error), "error");
      }
    };

    doExport();

    return () => {
      controller.abort();
    };
  }, [isOpen, currentJobId]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();

    const jobId = currentJobId;
    setProgress(0);

    if (jobId) {
      // Именно cancelExport, а не cancel: последний сбрасывает файлы
      // в queued и делает повторный экспорт невозможным
      jobsApi.cancelExport(jobId).catch((error) => {
        console.error("Failed to cancel export job", error);
      });
    }

    setIsExporting(false);
    closeExportModal();
  }, [currentJobId, setIsExporting, closeExportModal]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleCancel();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleCancel]);

  const selectedJobs = jobs.filter(
    (job) => job.status === "done" && job.selected_for_export !== false,
  );
  const total = selectedJobs.length;
  const current = Math.round((progress / 100) * total);

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} closeOnBackdrop={false} size="md">
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
