// frontend/src/components/organisms/SuccessModal/SuccessModal.tsx
import React from "react";
import { Modal } from "../../atoms/Modal/Modal";
import { Button } from "../../atoms/Button/Button";
import { Icon } from "../../atoms/Icon/Icon";
import { useUIStore } from "../../../store/useUIStore";
import { useAppStore } from "../../../store/useAppStore";
import styles from "./SuccessModal.module.scss";
import { jobsApi } from "../../../services/api/api";

export const SuccessModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isSuccessModalOpen);
  const closeSuccessModal = useUIStore((state) => state.closeSuccessModal);
  const setIsUploaded = useUIStore((state) => state.setIsUploaded);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsExporting = useUIStore((state) => state.setIsExporting);
  const resetBatchState = useAppStore((state) => state.resetBatchState);
  const previews = useAppStore((state) => state.previews);
  const jobs = useAppStore((state) => state.jobs);
  const setCurrentJobId = useUIStore((state) => state.setCurrentJobId);
  const setSelectedJobId = useUIStore((state) => state.setSelectedJobId);
  const currentJobId = useUIStore((state) => state.currentJobId);
  const exportArtifacts = useUIStore((state) => state.exportArtifacts);
  const setExportArtifacts = useUIStore((state) => state.setExportArtifacts);

  const handleBackToResults = () => {
    closeSuccessModal();
    setIsExporting(false);
  };

  const handleStartNewBatch = () => {
    Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
    resetBatchState();
    setIsUploaded(false);
    setIsExportReady(false);
    setIsExporting(false);
    setCurrentJobId(null);
    setSelectedJobId(null);
    setExportArtifacts([]);
    closeSuccessModal();
  };

  const handleOpenCsv = async () => {
    if (!currentJobId) return;

    const csvArtifact = exportArtifacts.find(
      (artifact) => artifact.export_format === "csv",
    );

    if (!csvArtifact) return;

    try {
      await jobsApi.openResultFile(currentJobId, csvArtifact.filename);
    } catch (error) {
      console.error(error);
    }
  };

  const handleOpenFolder = async () => {
    if (!currentJobId) return;

    try {
      await jobsApi.openResultsFolder(currentJobId);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeSuccessModal} closeOnBackdrop={false} size="lg">
      <div className={styles.content}>
        <Icon name="img-modal-icon" className={styles.icon} />
        <h2 className={styles.title}>Export completed successfully!</h2>
        <p className={styles.subtitle}>
          {jobs.length} photos are ready for stock upload. 
          CSV file generated, IPTC metadata embedded, approved photos exported.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" size="md" onClick={handleBackToResults}>
            Back to results
          </Button>

          <Button variant="secondary" size="md" onClick={handleStartNewBatch}>
            Start new batch
          </Button>

          <Button variant="primary" size="md" onClick={handleOpenCsv}>
            Open CSV file
          </Button>

          <Button variant="primary" size="md" onClick={handleOpenFolder}>
            Open folder
          </Button>
        </div>
      </div>
    </Modal>
  );
};
