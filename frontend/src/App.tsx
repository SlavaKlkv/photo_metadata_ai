//frontend/src/App.tsx
import React, { useEffect } from 'react';
import { useUIStore } from './store/useUIStore';
import { usePolling } from './hooks/usePolling';
import styles from './App.module.scss';
import { FileUploadSection } from './components/organisms/FileUploadSection/FileUploadSection';
import { SettingsPanel } from './components/organisms/SettingsPanel/SettingsPanel';
import { ProgressModal } from './components/organisms/ProgressModal/ProgressModal';
import { BottomActionBar } from './components/organisms/BottomActionBar/BottomActionBar';
import { ResultsTable } from './components/organisms/ResultsTable/ResultsTable';
import { MetadataPreview } from './components/organisms/MetadataPreview/MetadataPreview';
import { ExportModal } from './components/organisms/ExportModal/ExportModal';
import { SuccessModal } from './components/organisms/SuccessModal/SuccessModal';
import { OnboardingModal } from './components/organisms/OnboardingModal/OnboardingModal';
import { AISetupModal } from './components/organisms/AISetupModal/AISetupModal';
import { UpdateBanner } from './components/organisms/UpdateBanner/UpdateBanner';
import { SectionHeader } from './components/molecules/SectionHeader/SectionHeader';
import { Button } from './components/atoms/Button/Button';
import { Icon } from './components/atoms/Icon/Icon';
import { useAppStore } from './store/useAppStore';

function App() {
  const currentJobId = useUIStore((state) => state.currentJobId);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const isPollingActive = useUIStore((state) => state.isPollingActive);
  const loadSessionSettings = useAppStore((state) => state.loadSessionSettings);
  const discoverProviders = useAppStore((state) => state.discoverProviders);
  const checkForUpdates = useAppStore((state) => state.checkForUpdates);
  const hasAcceptedOnboarding = useAppStore(
    (state) => state.hasAcceptedOnboarding,
  );
  const openAiSetup = useUIStore((state) => state.openAiSetup);
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExporting = useUIStore((state) => state.isExporting);
  // AI Setup доступен только на шагах Upload/Context — до старта обработки
  const isAiSetupAvailable = !isProcessing && !isExportReady && !isExporting;

  useEffect(() => {
    const initializeApp = async () => {
      loadSessionSettings();
      void checkForUpdates();

      // ← ДОБАВИТЬ: artificially delay discovery to see "scanning" state
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await discoverProviders();
    };

    initializeApp();
  }, []);

  usePolling(isPollingActive ? currentJobId : null);

  return (
    <div className={styles.app}>
      <main className={styles.container}>
        <section className={styles.bodyShell}>
          <div className={styles.bodyHeader}>
            <SectionHeader
              icon="logo"
              title="Photo Metadata AI"
              subtitle="Prepare your photos for stock platforms in minutes"
              titleTag="h1"
              variant="app"
            />
            {hasAcceptedOnboarding && (
              <Button
                variant="secondary"
                size="md"
                icon={<Icon name="ai-setup-icon" />}
                onClick={openAiSetup}
                disabled={!isAiSetupAvailable}
                className={styles.aiSetupButton}
              >
                AI Setup
              </Button>
            )}
          </div>

          <div className={styles.bodyContent}>
            {isExportReady ? (
              <div className={styles.reviewGrid}>
                <SettingsPanel />
                <ResultsTable />
                <MetadataPreview />
              </div>
            ) : (
              <div className={styles.grid}>
                <aside className={styles.sidebar}>
                  <SettingsPanel />
                </aside>
                <div className={styles.content}>
                  <FileUploadSection />
                </div>
              </div>
            )}
          </div>

          <div className={styles.bodyFooter}>
            <BottomActionBar />
          </div>
        </section>
      </main>

      <ProgressModal />
      <ExportModal />
      <SuccessModal />
      <OnboardingModal />
      <AISetupModal />
      <UpdateBanner />
    </div>
  );
}

export default App;
