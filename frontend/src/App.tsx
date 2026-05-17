import React from 'react';
import { useAppStore } from './store/useAppStore';
import { useUIStore } from './store/useUIStore';
import styles from './App.module.scss';
import { Icon } from './components/atoms/Icon/Icon';
import { FileUploadSection } from './components/organisms/FileUploadSection/FileUploadSection';
import { SettingsPanel } from './components/organisms/SettingsPanel/SettingsPanel';
import { ProgressModal } from './components/organisms/ProgressModal/ProgressModal';
import { BottomActionBar } from './components/organisms/BottomActionBar/BottomActionBar';

function App() {
  const jobs = useAppStore((state) => state.jobs);
  const closeProgressModal = useUIStore((state) => state.closeProgressModal);

  const totalJobs = jobs.length;
  const currentProgress = jobs.filter(
    (job) => job.status === 'processing' || job.status === 'done' || job.status === 'error'
  ).length;

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
        <div className={styles.grid}>
          {/* LEFT: Settings */}
          <aside className={styles.sidebar}>
            <SettingsPanel />
          </aside>
          
          {/* RIGHT: Upload & Info */}
          <div className={styles.content}>
            <FileUploadSection />
          </div>
        </div>
      </main>
      
      {/* BOTTOM: Action bar */}
      <BottomActionBar />
      
      {/* MODAL: Progress (поверх всего) */}
      <ProgressModal
        current={currentProgress}
        total={totalJobs}
        onCancel={closeProgressModal}
      />
    </div>
  );
}

export default App;
