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
  const previews = useAppStore((state) => state.previews);
  const draftBatchSettings = useAppStore((state) => state.draftBatchSettings);
  const sessionSettings = useAppStore((state) => state.sessionSettings);

  const lockBatchSettings = useAppStore((state) => state.lockBatchSettings);
  const unlockBatchSettings = useAppStore((state) => state.unlockBatchSettings);
  const resetBatchState = useAppStore((state) => state.resetBatchState);
  const saveSessionSettings = useAppStore((state) => state.saveSessionSettings);

  const isUploaded = useUIStore((state) => state.isUploaded);
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const isExporting = useUIStore((state) => state.isExporting);
  const currentJobId = useUIStore((state) => state.currentJobId);

  const setIsProcessing = useUIStore((state) => state.setIsProcessing);
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);
  const setIsExporting = useUIStore((state) => state.setIsExporting);
  const openExportModal = useUIStore((state) => state.openExportModal);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const setCurrentProcessingProvider = useUIStore(
    (state) => state.setCurrentProcessingProvider,
  );

  const addToast = useToastStore((state) => state.addToast);

  const currentStep = !isUploaded
    ? 0
    : isProcessing
      ? 2
      : isExporting
        ? 4
        : isExportReady
          ? 3
          : 1;

  const handleRestart = () => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    resetBatchState();
    setIsUploaded(false);
    setIsExportReady(false);
    setIsPollingActive(false);
    setIsProcessing(false);
    setCurrentJobId(null);
    setSelectedJobId(null);
    setCurrentProcessingProvider(null);
  };

  const handleStartProcessing = async () => {
    if (!currentJobId) return;

    lockBatchSettings();
    saveSessionSettings();

    const { draftBatchSettings: batchSnapshot } = useAppStore.getState();

    const selectedExportFormats = Object.entries(
      batchSnapshot.exportFormats,
    )
      .filter(([, enabled]) => enabled)
      .map(([format]) => format);

    try {
      setIsProcessing(true);

      await jobsApi.updateSettings(currentJobId, {
        shooting_context: batchSnapshot.shootingContext,
        stock_platform: batchSnapshot.stockPlatform,
        ai_provider: sessionSettings.selectedProvider || 'ollama',
        export_formats: selectedExportFormats,
      });

      const processResponse = await jobsApi.startProcessing(currentJobId);
      const actualJobId = processResponse.data.job_id ?? currentJobId;

      setCurrentJobId(actualJobId);
      setIsPollingActive(true);
      openProgressModal();
    } catch (error) {
      unlockBatchSettings();
      setIsProcessing(false);
      addToast('Failed to start processing', 'error');
    }
  };

  return (
    <footer className={styles.bar}>
      <nav className={styles.stepper}>
        {STEPS.map((step, index) => (
          <React.Fragment key={step}>
            <div
              className={`${styles.step} ${index <= currentStep ? styles.active : ''}`}
            >
              <span className={styles.stepNumber}>{index + 1}</span>
              <span className={styles.stepLabel}>{step}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`${styles.line} ${index < currentStep ? styles.activeLine : ''}`}
              />
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className={styles.actions}>
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

        <Button
          variant="primary"
          size="md"
          icon={<Icon name="start-icon" className={styles.btnIcon} />}
          disabled={
            !isUploaded ||
            isProcessing ||
            isExportReady ||
            !draftBatchSettings.shootingContext.trim() ||
            !sessionSettings.selectedProvider
          }
          title={
            !draftBatchSettings.shootingContext.trim()
              ? 'Add shoot notes to start processing'
              : !sessionSettings.selectedProvider
                ? 'Select an available AI provider to start processing'
                : undefined
          }
          onClick={handleStartProcessing}
        >
          Start processing
        </Button>

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
