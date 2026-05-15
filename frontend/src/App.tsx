import React from 'react';
import { useAppStore } from './store/useAppStore';
import styles from './App.module.scss';
//import { FileUpload } from '@/components/molecules/FileUpload/FileUpload';
//import { SettingsPanel } from '@/components/organisms/SettingsPanel/SettingsPanel';
//import { FeatureCards } from '@/components/organisms/FeatureCards/FeatureCards';
//import { ProgressModal } from '@/components/organisms/ProgressModal/ProgressModal';
//import { BottomStatusBar } from '@/components/molecules/BottomStatusBar/BottomStatusBar';
//import { BottomActionBar } from '@/components/organisms/

function App() {
  const jobs = useAppStore((state) => state.jobs);
  
  return (
    <div className={styles.app}>
      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.title}>
            <span className={styles.logo}>✨</span>
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
          
          {/* RIGHT: Upload & Features */}
          <div className={styles.content}>
            <FileUpload />
            <FeatureCards />
          </div>
        </div>
      </main>
      
      {/* BOTTOM: Status bar */}
      <BottomStatusBar />
      
      {/* BOTTOM: Action bar */}
      <BottomActionBar />
      
      {/* MODAL: Progress (поверх всего) */}
      <ProgressModal />
    </div>
  );
}

export default App;
