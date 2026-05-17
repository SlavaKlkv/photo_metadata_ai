import React from 'react';
import { useUIStore } from './store/useUIStore';
import { usePolling } from './hooks/usePolling';
import styles from './App.module.scss';
import { Icon } from './components/atoms/Icon/Icon';
import { FileUploadSection } from './components/organisms/FileUploadSection/FileUploadSection';
import { SettingsPanel } from './components/organisms/SettingsPanel/SettingsPanel';
import { ProgressModal } from './components/organisms/ProgressModal/ProgressModal';
import { BottomActionBar } from './components/organisms/BottomActionBar/BottomActionBar';
import { ResultsTable } from './components/organisms/ResultsTable/ResultsTable';
//import { MetadataPreview } from './components/organisms/MetadataPreview/MetadataPreview';

function App() {
  const currentJobId = useUIStore((state) => state.currentJobId);
  const isExportReady = useUIStore((state) => state.isExportReady);

  usePolling(currentJobId);

  return (
    <div className={styles.app}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.title}>
            <Icon name="logo" className={styles.logo} />
            <div>
              <h1>Photo Metadata AI</h1>
              <p>Prepare your photos for stock platforms in minutes</p>
            </div>
          </div>
          <div className={styles.icons}>
            <button className={styles.iconBtn} title="Help">ℹ️</button>
            <button className={styles.iconBtn} title="Settings">⚙️</button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className={styles.container}>
        {isExportReady ? (
          // review экран — Results + MetadataPreview
          <div className={styles.reviewGrid}>
            <SettingsPanel />
            <ResultsTable />
            {/* <MetadataPreview /> */}
          </div>
        ) : (
          // upload экран — Settings + FileUpload
          <div className={styles.grid}>
            <aside className={styles.sidebar}>
              <SettingsPanel />
            </aside>
            <div className={styles.content}>
              <FileUploadSection />
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM */}
      <BottomActionBar />

      {/* MODAL */}
      <ProgressModal />
    </div>
  );
}

export default App;