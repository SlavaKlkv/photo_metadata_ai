// frontend/src/components/organisms/BottomActionBar/BottomActionBar.tsx
import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { useUIStore } from '../../../store/useUIStore';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import styles from './BottomActionBar.module.scss';
import { jobsApi } from '../../../services/api/api';
import { useToastStore } from '../../../store/useToastStore';

const STEPS = ['Upload', 'Context', 'Process', 'Review', 'Export'] as const;

export const BottomActionBar: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const isUploaded = useUIStore((state) => state.isUploaded);
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const clearAll = useAppStore((state) => state.clearAll);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);
  const settings = useAppStore((state) => state.settings);
  const isExporting = useUIStore((state) => state.isExporting);
  const setIsExporting = useUIStore((state) => state.setIsExporting);
  const openExportModal = useUIStore((state) => state.openExportModal);
  const addToast = useToastStore((state) => state.addToast);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);

  // текущий шаг степпера
  const currentStep = !isUploaded
    ? 0
    : isProcessing
      ? 2
      : isExporting
        ? 4
        : isExportReady
          ? 3
          : 1;
  const previews = useAppStore((state) => state.previews);

  const handleRestart = () => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    clearAll();
    setIsUploaded(false);
    setIsExportReady(false);
    setIsPollingActive(false);
    setCurrentJobId(null);
  };

  const handleStartProcessing = async () => {
    if (!currentJobId) return;

    try {
      await jobsApi.updateSettings(currentJobId, {
        shooting_context: settings.shootingContext,
        stock_platform: settings.exportFormat,
        ai_provider: settings.aiProvider,
      });

      const processResponse = await jobsApi.startProcessing(currentJobId);
      // обновляем jobId из ответа на случай если бэкенд вернул новый
      const actualJobId = processResponse.data.job_id ?? currentJobId;
      setCurrentJobId(actualJobId);

      setIsPollingActive(true);
      openProgressModal();
    } catch (error: any) {
      addToast("Failed to start processing", "error");
    }
  };

  return (
    <footer className={styles.bar}>
      {/* Степпер */}
      <nav className={styles.stepper}>
        {STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <div
              className={`${styles.step} ${index <= currentStep ? styles.active : ""}`}
            >
              <span className={styles.stepNumber}>{index + 1}</span>
              <span className={styles.stepLabel}>{step}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`${styles.line} ${index < currentStep ? styles.activeLine : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Кнопки */}
      <div className={styles.actions}>
        {/* Restart — появляется после загрузки*/}
        {isUploaded && (
          <Button
            variant="secondary"
            size="md"
            icon={<Icon name="restart-icon" className={styles.btnIcon} />}
            onClick={handleRestart}
          >
            Restart
          </Button>
        )}

        {/* Start processing — активна после загрузки */}
        <Button
          variant="primary"
          size="md"
          icon={<Icon name="start-icon" className={styles.btnIcon} />}
          disabled={
            !isUploaded ||
            isProcessing ||
            !settings.shootingContext.trim() ||
            isExportReady
          }
          title={
            !settings.shootingContext.trim()
              ? "Add shoot notes to start processing"
              : undefined
          }
          onClick={handleStartProcessing}
        >
          Start processing
        </Button>

        {/* Export — активна только после processing */}
        <Button
          variant="primary"
          size="md"
          icon={<Icon name="download-icon" className={styles.btnIcon} />}
          disabled={!isExportReady}
          onClick={() => {
            setIsExporting(true);
            openExportModal();
          }}
        >
          Export results
        </Button>
      </div>
    </footer>
  );
};
