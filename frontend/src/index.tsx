import React from 'react';
import ReactDOM from 'react-dom/client';

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <div>Photo Metadata AI</div>
    </React.StrictMode>,
  );
}