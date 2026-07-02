//frontend/src/App.tsx
import React, { useEffect } from 'react';
import { useUIStore } from './store/useUIStore';
import { usePolling } from './hooks/usePolling';
import styles from './App.module.scss';
import { Icon } from './components/atoms/Icon/Icon';
import { FileUploadSection } from './components/organisms/FileUploadSection/FileUploadSection';
import { SettingsPanel } from './components/organisms/SettingsPanel/SettingsPanel';
import { ProgressModal } from './components/organisms/ProgressModal/ProgressModal';
import { BottomActionBar } from './components/organisms/BottomActionBar/BottomActionBar';
import { ResultsTable } from './components/organisms/ResultsTable/ResultsTable';
import { MetadataPreview } from './components/organisms/MetadataPreview/MetadataPreview';
import { ExportModal } from './components/organisms/ExportModal/ExportModal';
import { SuccessModal } from './components/organisms/SuccessModal/SuccessModal';
import { OnboardingModal } from './components/organisms/OnboardingModal/OnboardingModal';
import { useAppStore } from './store/useAppStore';

function App() {
  const currentJobId = useUIStore((state) => state.currentJobId);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const isPollingActive = useUIStore((state) => state.isPollingActive);
  const loadSessionSettings = useAppStore((state) => state.loadSessionSettings);
  const discoverProviders = useAppStore((state) => state.discoverProviders);

  useEffect(() => {
    const initializeApp = async () => {
      loadSessionSettings();

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
            <div className={styles.titleBlock}>
              <Icon name="logo" className={styles.logo} />
              <div className={styles.titleText}>
                <h1>Photo Metadata AI</h1>
                <p>Prepare your photos for stock platforms in minutes</p>
              </div>
            </div>
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
    </div>
  );
}

export default App;