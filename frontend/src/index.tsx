import React from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from './store/useAppStore';

// от базового к специфичному
import './styles/variables.module.scss';       // 1. Переменные
import './styles/reset.module.scss';           // 2. Reset
import './styles/animations.module.scss';      // 3. Animations
import './styles/utilities.module.scss';       // 4. Utilities (опционально)

const rootElement = document.getElementById('root');

if (process.env.NODE_ENV === 'development') {
  useAppStore.getState().inc();
}

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <div>Photo Metadata AI</div>
    </React.StrictMode>,
  );
}