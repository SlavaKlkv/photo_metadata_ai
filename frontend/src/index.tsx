import React from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from './store/useAppStore';

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