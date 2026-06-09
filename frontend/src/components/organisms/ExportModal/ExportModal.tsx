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

  const exportFormats = useAppStore(
    (state) => state.draftBatchSettings.exportFormats,
  );

  const setExportArtifacts = useUIStore((state) => state.setExportArtifacts);

  const [progress, setProgress] = useState(0);
  const [isCancelled, setIsCancelled] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentJobId) return;

    setProgress(0);
    setIsCancelled(false);


    const doExport = async () => {
      try {
        await jobsApi.startExport(currentJobId, {
          csv: exportFormats.csv,
          iptc: exportFormats.iptc,
        });

        let exportCompleted = false;

        while (!exportCompleted) {
          const { data } = await jobsApi.getExportStatus(currentJobId);

          if (isCancelled) return;

          setProgress(data.export_progress);

          if (data.export_status === "completed") {
            setExportArtifacts(data.export_artifacts ?? []);

            exportCompleted = true;
            break;
          }

          if (data.export_status === "failed") {
            throw new Error("Export failed");
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        setProgress(100);

        setTimeout(() => {
          closeExportModal();
          openSuccessModal();
        }, 500);
      } catch (error) {
        closeExportModal();
      }
    };

    doExport();

    return () => {
    };
  }, [isOpen]);

  const handleCancel = () => {
    setIsCancelled(true);
    closeExportModal();
  };

  const total = jobs.length;
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