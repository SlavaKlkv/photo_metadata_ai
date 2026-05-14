import React from 'react';
import { useAppStore } from './store/useAppStore';
import styles from './App.module.scss';

const App: React.FC = () => {
  // Example of using Zustand store
  const appState = useAppStore();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>Photo Metadata AI</h1>
      </header>

      <main className={styles.main}>
        {/* Components will be added here */}
        <p>Welcome to the application</p>
      </main>

      <footer className={styles.footer}>
        <p>&copy; 2026 Photo Metadata AI</p>
      </footer>
    </div>
  );
};

export default App;
