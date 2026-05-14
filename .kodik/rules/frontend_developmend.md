# 🚀 FRONTEND DEVELOPMENT GUIDE (Create React App)
**Photo Metadata AI — 10-дневный спринт**

**Файл для использования в cursor/VSC как reference при разработке.**

---

## 📋 Содержание

1. [Архитектура & Структура проекта](#-архитектура--структура-проекта)
2. [Tech Stack & Setup](#-tech-stack--setup)
3. [Zustand Store (State Management)](#-zustand-store-state-management)
4. [Компоненты (по дням)](#-компоненты-по-дням)
5. [API Integration & Backend зависимости](#-api-integration--backend-зависимости)
6. [Стили & Дизайн система](#-стили--дизайн-система)
7. [Дневный план с примерами](#-дневный-план-с-примерами)
8. [Тестирование](#-тестирование)
9. [Деплой (EXE, CLI)](#-деплой-exe-cli)

---

## 🏗️ Архитектура & Структура проекта

### Папки и их смысл (в папке `frontend/`):

```
photo-metadata-ai/frontend/
├── src/
│   ├── components/           # React компоненты (переиспользуемые)
│   │   ├── FileUpload/
│   │   │   ├── FileUpload.tsx
│   │   │   └── FileUpload.module.scss
│   │   ├── ProgressBar/
│   │   ├── ResultsTable/
│   │   ├── Settings/
│   │   ├── Toast/
│   │   └── common/           # кнопки, inputs, etc
│   │
│   ├── store/                # Zustand stores (state management)
│   │   ├── useAppStore.ts    # ГЛАВНОЕ хранилище (jobs, settings, UI state)
│   │   └── useToastStore.ts  # Уведомления (toasts)
│   │
│   ├── services/             # Бизнес-логика
│   │   ├── api/
│   │   │   ├── api.ts        # Real API (Day 3+ заменяет mockApi)
│   │   │   └── mockApi.ts    # Mock API для параллельной разработки (Day 1-3)
│   │   └── export/           # CSV generation logic
│   │
│   ├── types/                # TypeScript типы (shared)
│   │   └── index.ts
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── usePolling.ts     # Polling logic for status updates (Day 3)
│   │   └── useLocalStorage.ts
│   │
│   ├── styles/               # Глобальные стили
│   │   ├── variables.scss    # CSS переменные (colors, spacing)
│   │   ├── theme.scss        # Тёмная тема
│   │   └── reset.scss        # CSS reset
│   │
│   ├── App.tsx               # Root компонент
│   └── index.tsx             # React entry point
│
├── public/                   # Static files (favicon, manifest)
├── bin/
│   └── cli.ts                # CLI инструмент (день 8)
│
├── package.json
├── tsconfig.json
├── .env.local                # API_URL (не коммитим)
└── .env.example              # Пример .env
```

### Порядок разработки (зависимости):

```
Day 1-2:  Types → Store → Mock API → Components (не зависит от backend)
Day 3:    Real API integration (БЛОКЕР: ждём Backend #3, #20, #11)
Day 4-5:  Progress Bar, Results Table, Inline Edit (зависят от real API)
Day 5-6:  Export, Styling (зависят от Backend #14)
Day 7-8:  EXE + CLI
```

**⚠️ КРИТИЧЕСКАЯ ЗАВИСИМОСТЬ от Backend:**
- **FE-7 (Progress Bar)** → ждёт **Backend #20** (status endpoint)
- **FE-8 (Results Table)** → ждёт **Backend #11** (results endpoint)
- **FE-9 (API Integration)** → ждёт **Backend #3, #20, #11**
- **FE-10 (Inline Edit)** → ждёт **Backend #12** (update endpoint)
- **FE-11 (CSV Export)** → ждёт **Backend #14** (export endpoint)

---

## 🛠️ Tech Stack & Setup

### Зависимости (Create React App):

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "zustand": "^4.5.0",
    "axios": "^1.7.0",
    "typescript": "^4.9.5"
  },
  "devDependencies": {
    "@testing-library/react": "^13.4.0",
    "@testing-library/jest-dom": "^5.16.5",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "pkg:exe": "npm run build && pkg . --targets win-x64,macos-x64",
    "pkg:dmg": "npm run build && pkg . --targets macos-x64"
  }
}
```

### Команды:

```bash
# Development — запуск на localhost:3000
cd frontend/
npm start

# Build для production
npm run build              # → build/ папка

# Тестирование
npm test                   # Jest (встроен в CRA)
npm test -- --coverage

# Package to EXE
npm install --save-dev pkg
npm run pkg:exe            # → dist/photo-metadata-ai-win-x64.exe

# CLI тестирование (День 8)
npm link
photo-metadata-ai ~/photos --provider claude
```

### Environment переменные (`.env.local`):

```bash
# .env.local (не коммитим в git)
REACT_APP_API_URL=http://localhost:8000

# .env.example (коммитим)
REACT_APP_API_URL=http://localhost:8000
```

**⚠️ CRA Note:** Все env переменные должны начинаться с `REACT_APP_` для доступа в коде.

---

## 🔗 Backend зависимости (КРИТИЧНО)

**Этот раздел ОЧЕНЬ важен — FE часто ждёт backend!**

### День 2 (конец дня) — Backend должен выпустить:

Backend задачи: **#1** (Job model), **#3** (Upload endpoint)

```typescript
// Frontend ждёт эту структуру:
interface ProcessingJob {
  id: string;
  filename: string;
  originalFilename: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  metadata?: {
    title: string;
    description: string;
    keywords: string[];
  };
}

// API Contract:
POST /upload
  Body: { files: File[], shooting_context: string, ai_provider: string }
  Response: { jobIds: string[] }
```

**Если backend не готов:** используем `mockApi.ts` и переключимся на real API позже (День 3).

### День 3 (конец дня) — Backend должен выпустить:

Backend задачи: **#20** (Status), **#11** (Results)

```typescript
// FE-7 (Progress Bar) ждёт:
GET /status → ProcessingJob[] (все файлы + их статусы)

// FE-8 (Results Table) ждёт:
GET /results → ProcessingJob[] (только done + их metadata)
```

**Если backend отстает:**
- День 3-4: FE работает с mock API
- День 4-5: Переключаемся на real API когда endpoint'ы готовы

### День 5 (конец дня) — Backend должен выпустить:

Backend задачи: **#12** (Update metadata), **#14** (Export)

```typescript
// FE-10 (Inline Edit) ждёт:
PUT /metadata/{jobId} → void

// FE-11 (CSV Export) ждёт:
GET /export → Blob (CSV файл)
```

---

---

## 💾 Zustand Store (State Management)

**Файл: `src/store/useAppStore.ts`**

### Store структура:

```typescript
import create from 'zustand';

// Types (move to src/types/index.ts for clarity)
export interface ProcessingJob {
  id: string;
  filename: string;
  originalFilename: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  metadata?: {
    title: string;
    description: string;
    keywords: string[];
  };
}

export interface AppSettings {
  aiProvider: 'ollama' | 'claude' | 'openai';
  shootingContext: string;
  exportFormat: 'getty' | 'shutterstock' | 'adobe';
}

interface AppState {
  // Jobs (файлы в обработке)
  jobs: ProcessingJob[];
  addJobs: (jobs: ProcessingJob[]) => void;
  updateJobStatus: (jobId: string, status: ProcessingJob['status'], error?: string) => void;
  updateJobMetadata: (jobId: string, metadata: ProcessingJob['metadata']) => void;
  
  // Settings
  settings: AppSettings;
  updateSettings: (key: keyof AppSettings, value: any) => void;
  
  // UI State
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
  
  // Utilities
  getOverallProgress: () => number; // 0-100
  hasErrors: () => boolean;
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  jobs: [],
  settings: {
    aiProvider: 'ollama',
    shootingContext: '',
    exportFormat: 'getty',
  },
  isProcessing: false,
  
  // Actions
  addJobs: (newJobs) =>
    set((state) => ({
      jobs: [...state.jobs, ...newJobs],
    })),
  
  updateJobStatus: (jobId, status, error) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId ? { ...job, status, error } : job
      ),
    })),
  
  updateJobMetadata: (jobId, metadata) =>
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId ? { ...job, metadata } : job
      ),
    })),
  
  updateSettings: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),
  
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  
  // Computed state (не хранится, считается каждый раз)
  getOverallProgress: () => {
    const { jobs } = get();
    if (jobs.length === 0) return 0;
    
    const doneCount = jobs.filter((j) => j.status === 'done' || j.status === 'error').length;
    return Math.round((doneCount / jobs.length) * 100);
  },
  
  hasErrors: () => {
    const { jobs } = get();
    return jobs.some((j) => j.status === 'error');
  },
  
  // Reset
  clearAll: () =>
    set({
      jobs: [],
      isProcessing: false,
    }),
}));
```

### Использование в компонентах:

```typescript
import { useAppStore } from '@/store/useAppStore';

function MyComponent() {
  // Подписываемся на нужные части state (оптимизация)
  const jobs = useAppStore((state) => state.jobs);
  const addJobs = useAppStore((state) => state.addJobs);
  const progress = useAppStore((state) => state.getOverallProgress());
  
  return (
    <div>
      <p>Progress: {progress}%</p>
      <button onClick={() => addJobs([...])}>Add Jobs</button>
    </div>
  );
}
```

**💡 Совет:** Используй селекторы для оптимизации (не переренди весь компонент если changed только одно поле).

---

## 🧩 Компоненты (по дням)

### День 1-2: Базовые компоненты

#### 1. FileUpload компонент

**Файл: `src/components/FileUpload/FileUpload.tsx`**

```typescript
import React, { useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './FileUpload.module.scss';

interface FileUploadProps {
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ disabled = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addJobs = useAppStore((state) => state.addJobs);
  const [dragActive, setDragActive] = React.useState(false);
  
  const ALLOWED_FORMATS = ['image/jpeg', 'image/png'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  
  // Валидация файла
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return { valid: false, error: `Format not supported: ${file.type}` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }
    return { valid: true };
  };
  
  // Преобразовать File[] → ProcessingJob[]
  const filesToJobs = (files: File[]) => {
    return files
      .map((file) => {
        const validation = validateFile(file);
        return {
          id: `${Date.now()}-${Math.random()}`, // Unique ID
          filename: file.name,
          originalFilename: file.name,
          status: validation.valid ? 'queued' : 'error',
          error: validation.error,
          metadata: undefined,
        };
      });
  };
  
  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const jobs = filesToJobs(files);
    addJobs(jobs);
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    const jobs = filesToJobs(files);
    addJobs(jobs);
  };
  
  return (
    <div className={styles.fileUploadContainer}>
      <div
        className={`${styles.dropZone} ${dragActive ? styles.active : ''} ${disabled ? styles.disabled : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <div className={styles.content}>
          <span className={styles.icon}>📸</span>
          <h3>Drag & drop photos here</h3>
          <p>or click to select</p>
          <span className={styles.format}>JPG, PNG • Max 10MB each</span>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_FORMATS.join(',')}
          onChange={handleChange}
          disabled={disabled}
          className={styles.input}
        />
      </div>
    </div>
  );
};
```

**SCSS: `src/components/FileUpload/FileUpload.module.scss`**

```scss
@import '@/styles/variables.scss';

.fileUploadContainer {
  width: 100%;
}

.dropZone {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: var(--bg-secondary);
  
  &:hover:not(.disabled) {
    border-color: var(--accent-color);
    background-color: rgba(74, 158, 255, 0.1);
  }
  
  &.active {
    border-color: var(--accent-color);
    background-color: rgba(74, 158, 255, 0.15);
    transform: scale(1.02);
  }
  
  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon {
  font-size: 48px;
}

.dropZone h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
  font-weight: 600;
}

.dropZone p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.format {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.input {
  display: none;
}

// Responsive
@media (max-width: 640px) {
  .dropZone {
    padding: 32px 16px;
  }
  
  .icon {
    font-size: 36px;
  }
  
  .dropZone h3 {
    font-size: 16px;
  }
}
```

---

#### 2. Settings Panel компонент

**Файл: `src/components/Settings/Settings.tsx`**

```typescript
import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './Settings.module.scss';

export const Settings: React.FC = () => {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  
  // Load from localStorage на инициализацию
  useEffect(() => {
    const saved = localStorage.getItem('app_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.entries(parsed).forEach(([key, value]) => {
          updateSettings(key as any, value);
        });
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
  }, []);
  
  // Save to localStorage когда settings меняются
  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);
  
  const handleChange = (key: keyof typeof settings, value: any) => {
    updateSettings(key, value);
  };
  
  return (
    <div className={styles.settingsPanel}>
      <h2>Settings</h2>
      
      <div className={styles.group}>
        <label htmlFor="shooting-context">Shooting Context (optional)</label>
        <input
          id="shooting-context"
          type="text"
          placeholder="e.g., Wedding, May 2026"
          value={settings.shootingContext}
          onChange={(e) => handleChange('shootingContext', e.target.value)}
          className={styles.input}
        />
        <small>Describe the event or theme for better AI analysis</small>
      </div>
      
      <div className={styles.group}>
        <label htmlFor="ai-provider">AI Provider</label>
        <select
          id="ai-provider"
          value={settings.aiProvider}
          onChange={(e) => handleChange('aiProvider', e.target.value)}
          className={styles.select}
        >
          <option value="ollama">Ollama (local, fast)</option>
          <option value="claude">Claude (Anthropic)</option>
          <option value="openai">OpenAI (GPT-4)</option>
        </select>
      </div>
      
      <div className={styles.group}>
        <label htmlFor="export-format">Export Format</label>
        <select
          id="export-format"
          value={settings.exportFormat}
          onChange={(e) => handleChange('exportFormat', e.target.value)}
          className={styles.select}
        >
          <option value="getty">Getty Images</option>
          <option value="shutterstock">Shutterstock</option>
          <option value="adobe">Adobe Stock</option>
        </select>
      </div>
    </div>
  );
};
```

**SCSS: `src/components/Settings/Settings.module.scss`**

```scss
.settingsPanel {
  background-color: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  
  h2 {
    margin: 0 0 20px 0;
    font-size: 18px;
    color: var(--text-primary);
  }
}

.group {
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.input,
.select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;
  
  &:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.1);
  }
  
  &::placeholder {
    color: var(--text-secondary);
  }
}
```

---

#### 3. Zustand Store инициализация

**Файл: `src/store/useAppStore.ts`** (см. выше, полный пример в секции "Zustand Store")

---

### День 3-4: Progress & Preview компоненты

#### 4. Progress Bar компонент

**Файл: `src/components/ProgressBar/ProgressBar.tsx`**

```typescript
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './ProgressBar.module.scss';

export const ProgressBar: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const progress = useAppStore((state) => state.getOverallProgress());
  
  if (jobs.length === 0) return null; // Show only if there are jobs
  
  const statusCounts = {
    queued: jobs.filter((j) => j.status === 'queued').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    done: jobs.filter((j) => j.status === 'done').length,
    error: jobs.filter((j) => j.status === 'error').length,
  };
  
  return (
    <div className={styles.progressContainer}>
      <div className={styles.header}>
        <h3>Processing Progress</h3>
        <span className={styles.percentage}>{progress}%</span>
      </div>
      
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${progress}%` }} />
      </div>
      
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={`${styles.indicator} ${styles.queued}`} />
          Queued: {statusCounts.queued}
        </div>
        <div className={styles.stat}>
          <span className={`${styles.indicator} ${styles.processing}`} />
          Processing: {statusCounts.processing}
        </div>
        <div className={styles.stat}>
          <span className={`${styles.indicator} ${styles.done}`} />
          Done: {statusCounts.done}
        </div>
        <div className={styles.stat}>
          <span className={`${styles.indicator} ${styles.error}`} />
          Error: {statusCounts.error}
        </div>
      </div>
      
      <div className={styles.fileList}>
        <h4>Files:</h4>
        <div className={styles.files}>
          {jobs.map((job) => (
            <div key={job.id} className={`${styles.fileItem} ${styles[job.status]}`}>
              <span className={styles.name}>{job.originalFilename}</span>
              <span className={styles.status}>{job.status}</span>
              {job.error && <small className={styles.error}>{job.error}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

**SCSS: `src/components/ProgressBar/ProgressBar.module.scss`**

```scss
.progressContainer {
  background-color: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  margin: 20px 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  
  h3 {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
  }
}

.percentage {
  font-size: 24px;
  font-weight: bold;
  color: var(--accent-color);
}

.bar {
  width: 100%;
  height: 8px;
  background-color: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 16px;
}

.fill {
  height: 100%;
  background-color: var(--accent-color);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  
  &.queued {
    background-color: #ffa500;
  }
  
  &.processing {
    background-color: #4a9eff;
    animation: pulse 1s infinite;
  }
  
  &.done {
    background-color: #4caf50;
  }
  
  &.error {
    background-color: #ff6b6b;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.fileList {
  margin-top: 20px;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.files {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.fileItem {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border-radius: 6px;
  font-size: 12px;
  
  &.processing {
    border-left: 3px solid #4a9eff;
  }
  
  &.done {
    border-left: 3px solid #4caf50;
  }
  
  &.error {
    border-left: 3px solid #ff6b6b;
  }
}

.name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background-color: rgba(0, 0, 0, 0.2);
  color: var(--text-secondary);
  text-transform: capitalize;
}

.error {
  display: block;
  margin-top: 4px;
  color: #ff6b6b;
  font-size: 10px;
}
```

---

#### 5. Results Table компонент

**Файл: `src/components/ResultsTable/ResultsTable.tsx`** (simplified version for day 3-4)

```typescript
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './ResultsTable.module.scss';

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const doneJobs = jobs.filter((j) => j.status === 'done' && j.metadata);
  
  if (doneJobs.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No results yet. Start processing photos to see metadata.</p>
      </div>
    );
  }
  
  return (
    <div className={styles.tableContainer}>
      <h3>Results Preview</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Original Name</th>
              <th>New Name</th>
              <th>Title</th>
              <th>Description</th>
              <th>Keywords</th>
            </tr>
          </thead>
          <tbody>
            {doneJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.originalFilename}</td>
                <td>{job.filename}</td>
                <td>{job.metadata?.title || '-'}</td>
                <td>{job.metadata?.description || '-'}</td>
                <td>{job.metadata?.keywords?.join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

**SCSS: `src/components/ResultsTable/ResultsTable.module.scss`**

```scss
.tableContainer {
  margin-top: 32px;
  
  h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    color: var(--text-primary);
  }
}

.tableWrapper {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--bg-secondary);
  
  thead {
    background-color: var(--bg-primary);
    position: sticky;
    top: 0;
  }
  
  th {
    padding: 12px;
    text-align: left;
    color: var(--text-primary);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border-color);
  }
  
  td {
    padding: 12px;
    color: var(--text-secondary);
    font-size: 13px;
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }
  
  tbody tr:hover {
    background-color: rgba(74, 158, 255, 0.05);
  }
}

.empty {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
  background-color: var(--bg-secondary);
  border-radius: 12px;
  margin-top: 32px;
  
  p {
    margin: 0;
  }
}
```

---

### День 5-6: Inline Editing & Export

#### 6. Inline Editing (upgrading ResultsTable)

**Обновленный результат в `ResultsTable.tsx`:**

```typescript
import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import { apiService } from '@/services/api/api'; // Real API call
import styles from './ResultsTable.module.scss';

interface EditingCell {
  jobId: string;
  field: 'title' | 'description' | 'keywords';
}

export const ResultsTable: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const updateJobMetadata = useAppStore((state) => state.updateJobMetadata);
  const addToast = useToastStore((state) => state.addToast);
  
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const doneJobs = jobs.filter((j) => j.status === 'done' && j.metadata);
  
  const handleCellClick = (jobId: string, field: EditingCell['field'], currentValue: string) => {
    setEditingCell({ jobId, field });
    setEditValue(currentValue);
  };
  
  const validateField = (field: EditingCell['field'], value: string): { valid: boolean; error?: string } => {
    const trimmed = value.trim();
    
    switch (field) {
      case 'title':
        if (trimmed.length > 70) return { valid: false, error: 'Title max 70 characters' };
        break;
      case 'description':
        if (trimmed.length > 200) return { valid: false, error: 'Description max 200 characters' };
        break;
      case 'keywords':
        const keywordArray = trimmed.split(',').map((k) => k.trim());
        if (keywordArray.length > 50) return { valid: false, error: 'Max 50 keywords' };
        break;
    }
    
    return { valid: true };
  };
  
  const handleSave = async (jobId: string, field: EditingCell['field']) => {
    const validation = validateField(field, editValue);
    if (!validation.valid) {
      addToast(validation.error!, 'error');
      return;
    }
    
    setIsSaving(true);
    try {
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !job.metadata) return;
      
      const updatedMetadata = { ...job.metadata };
      if (field === 'keywords') {
        updatedMetadata.keywords = editValue.split(',').map((k) => k.trim());
      } else {
        updatedMetadata[field] = editValue;
      }
      
      // Call backend API
      await apiService.updateMetadata(jobId, updatedMetadata);
      
      // Update store
      updateJobMetadata(jobId, updatedMetadata);
      
      addToast('Metadata updated', 'success');
      setEditingCell(null);
    } catch (err) {
      addToast('Failed to update metadata', 'error');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent, jobId: string, field: EditingCell['field']) => {
    if (e.key === 'Enter') handleSave(jobId, field);
    if (e.key === 'Escape') setEditingCell(null);
  };
  
  if (doneJobs.length === 0) {
    return <div className={styles.empty}>No results yet...</div>;
  }
  
  return (
    <div className={styles.tableContainer}>
      <h3>Results Preview</h3>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Original Name</th>
              <th>New Name</th>
              <th>Title</th>
              <th>Description</th>
              <th>Keywords</th>
            </tr>
          </thead>
          <tbody>
            {doneJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.originalFilename}</td>
                <td>{job.filename}</td>
                <td
                  className={styles.editableCell}
                  onClick={() => handleCellClick(job.id, 'title', job.metadata?.title || '')}
                  title="Double-click to edit"
                >
                  {editingCell?.jobId === job.id && editingCell.field === 'title' ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleSave(job.id, 'title')}
                      onKeyDown={(e) => handleKeyDown(e, job.id, 'title')}
                      disabled={isSaving}
                      maxLength={70}
                    />
                  ) : (
                    job.metadata?.title || '-'
                  )}
                </td>
                <td
                  className={styles.editableCell}
                  onClick={() => handleCellClick(job.id, 'description', job.metadata?.description || '')}
                >
                  {editingCell?.jobId === job.id && editingCell.field === 'description' ? (
                    <textarea
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleSave(job.id, 'description')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) handleSave(job.id, 'description');
                        if (e.key === 'Escape') setEditingCell(null);
                      }}
                      disabled={isSaving}
                      maxLength={200}
                    />
                  ) : (
                    job.metadata?.description || '-'
                  )}
                </td>
                <td
                  className={styles.editableCell}
                  onClick={() => handleCellClick(job.id, 'keywords', job.metadata?.keywords?.join(', ') || '')}
                >
                  {editingCell?.jobId === job.id && editingCell.field === 'keywords' ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleSave(job.id, 'keywords')}
                      onKeyDown={(e) => handleKeyDown(e, job.id, 'keywords')}
                      disabled={isSaving}
                      placeholder="keyword1, keyword2, ..."
                    />
                  ) : (
                    job.metadata?.keywords?.join(', ') || '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

**Добавить в SCSS:**

```scss
.editableCell {
  cursor: pointer;
  position: relative;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: rgba(74, 158, 255, 0.1);
  }
  
  input,
  textarea {
    all: unset;
    width: 100%;
    padding: 4px;
    background-color: var(--bg-primary);
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 13px;
    
    &:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
    }
  }
  
  textarea {
    min-height: 60px;
    resize: none;
  }
}
```

---

## 🌐 API Integration & Backend зависимости

### День 1-3: Mock API (параллельная разработка, не ждём backend)

**Файл: `src/services/api/mockApi.ts`**

Используется в Days 1-2, затем опционально в Day 3 если backend не готов.

```typescript
// src/services/api/mockApi.ts
import { ProcessingJob } from '@/types';

export const mockApiService = {
  async uploadPhotos(files: File[], context: string, provider: string) {
    // Имитируем задержку сети
    await new Promise((r) => setTimeout(r, 500));
    
    // Генерируем fake job IDs для каждого файла
    return {
      jobIds: files.map((f) => `job-${Date.now()}-${Math.random()}`),
    };
  },
  
  async getJobStatus(jobId: string): Promise<ProcessingJob> {
    // Имитируем random статус (для тестирования progress bar)
    const statuses = ['queued', 'processing', 'done'] as const;
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    await new Promise((r) => setTimeout(r, 300));
    
    return {
      id: jobId,
      filename: `photo_${jobId.slice(0, 8)}.jpg`,
      originalFilename: 'photo.jpg',
      status: randomStatus,
      metadata:
        randomStatus === 'done'
          ? {
              title: 'Beautiful Sunset at Beach',
              description: 'A stunning golden hour photograph captured during the golden hour',
              keywords: ['sunset', 'beach', 'nature', 'landscape', 'ocean'],
            }
          : undefined,
    };
  },
  
  async getAllJobsStatus(): Promise<ProcessingJob[]> {
    // Возвращает все jobs с random статусами (для progress bar)
    const mockJobs: ProcessingJob[] = [
      {
        id: 'job-mock-1',
        filename: 'photo_wedding_001.jpg',
        originalFilename: 'IMG_0001.jpg',
        status: 'done',
        metadata: {
          title: 'Wedding Couple Portrait',
          description: 'Professional wedding photography with beautiful lighting',
          keywords: ['wedding', 'couple', 'portrait', 'love', 'celebration'],
        },
      },
      {
        id: 'job-mock-2',
        filename: 'photo_wedding_002.jpg',
        originalFilename: 'IMG_0002.jpg',
        status: 'processing',
      },
      {
        id: 'job-mock-3',
        filename: 'photo_wedding_003.jpg',
        originalFilename: 'IMG_0003.jpg',
        status: 'queued',
      },
    ];
    
    await new Promise((r) => setTimeout(r, 200));
    return mockJobs;
  },
  
  async updateMetadata(jobId: string, metadata: any) {
    await new Promise((r) => setTimeout(r, 300));
    return { success: true };
  },
  
  async exportToCSV() {
    // Возвращаем fake CSV как Blob
    const csv = `original_filename,new_filename,title,description,keywords
IMG_0001.jpg,photo_wedding_001.jpg,Wedding Couple Portrait,Professional wedding photography with beautiful lighting,wedding;couple;portrait;love;celebration
IMG_0002.jpg,photo_wedding_002.jpg,Reception Dance,Couple dancing at reception with guests,dance;celebration;wedding
IMG_0003.jpg,photo_wedding_003.jpg,Bride Preparation,Bride getting ready on wedding day,bride;preparation;wedding;makeup`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    return blob;
  },
};
```

### День 3 (Конец дня) — Real API Integration

**⚠️ БЛОКЕР:** Ждём Backend задач **#3, #20, #11** (Upload, Status, Results endpoints)

**Файл: `src/services/api/api.ts`**

Заменяет `mockApi` после того как backend endpoints готовы.

```typescript
// src/services/api/api.ts
import axios, { AxiosInstance } from 'axios';
import { ProcessingJob } from '@/types';

// ⚠️ CRA: используем REACT_APP_ префикс для env переменных
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Обработка ошибок для всех запросов
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message);
    if (error.response?.status === 503) {
      throw new Error('Backend unavailable. Check if server is running.');
    }
    throw error;
  }
);

export const apiService = {
  // ✅ Backend #3: Upload endpoint
  async uploadPhotos(files: File[], context: string, provider: string) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('shooting_context', context);
    formData.append('ai_provider', provider);
    
    try {
      const response = await axiosInstance.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data; // { jobIds: string[] }
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  },
  
  // ✅ Backend #20: Status endpoint (для одного файла)
  async getJobStatus(jobId: string): Promise<ProcessingJob> {
    try {
      const response = await axiosInstance.get(`/status/${jobId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get status for ${jobId}:`, error);
      throw error;
    }
  },
  
  // ✅ Backend #20: Status endpoint (для всех файлов) — используется для polling
  async getAllJobsStatus(): Promise<ProcessingJob[]> {
    try {
      const response = await axiosInstance.get('/status');
      return response.data;
    } catch (error) {
      console.error('Failed to get all statuses:', error);
      throw error;
    }
  },
  
  // ✅ Backend #11: Results endpoint (финальные метаданные)
  async getResults(): Promise<ProcessingJob[]> {
    try {
      const response = await axiosInstance.get('/results');
      return response.data;
    } catch (error) {
      console.error('Failed to get results:', error);
      throw error;
    }
  },
  
  // ✅ Backend #12: Update metadata endpoint (День 5)
  async updateMetadata(jobId: string, metadata: any) {
    try {
      const response = await axiosInstance.put(`/metadata/${jobId}`, metadata);
      return response.data;
    } catch (error) {
      console.error(`Failed to update metadata for ${jobId}:`, error);
      throw error;
    }
  },
  
  // ✅ Backend #14: Export endpoint (День 5)
  async exportToCSV(): Promise<Blob> {
    try {
      const response = await axiosInstance.get('/export', {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Failed to export CSV:', error);
      throw error;
    }
  },
};
```

### Как переключаться между Mock и Real API:

**`src/services/api/index.ts`** (единая точка входа):

```typescript
// src/services/api/index.ts
// 🔧 Переключай импорт в зависимости от фазы разработки:

// ⚠️ Day 1-2: используем mock API (backend ещё не готов)
export { mockApiService as apiService } from './mockApi';

// ✅ Day 3+: переключаемся на real API (если backend готов)
// export { apiService } from './api';

// Или более умный способ (с env переменной):
// const isProduction = process.env.NODE_ENV === 'production';
// export const apiService = isProduction ? require('./api') : require('./mockApi');
```

**В компонентах:**

```typescript
import { apiService } from '@/services/api'; // всегда используем这一 импорт

// Не нужно менять компоненты — просто переключай в index.ts!
```

### Polling hook для Status updates (День 3-4)

**Файл: `src/hooks/usePolling.ts`**

Используется в `ProgressBar` для live обновления статусов.

```typescript
import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiService } from '@/services/api';

/**
 * Polling hook для периодического получения статусов файлов
 * ⚠️ Backend зависимость: #20 (GET /status endpoint)
 */
export const usePolling = (interval: number = 2000) => {
  const setIsProcessing = useAppStore((state) => state.setIsProcessing);
  const addJobs = useAppStore((state) => state.addJobs);
  const jobs = useAppStore((state) => state.jobs);
  
  useEffect(() => {
    if (jobs.length === 0) return; // Нечего полировать
    
    const hasUnfinishedJobs = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (!hasUnfinishedJobs) {
      setIsProcessing(false);
      return; // Все готово, прекращаем polling
    }
    
    setIsProcessing(true);
    
    // Polling loop
    const pollInterval = setInterval(async () => {
      try {
        // ✅ Backend #20: Получаем статусы всех файлов
        const statuses = await apiService.getAllJobsStatus();
        
        // Обновляем store с новыми статусами
        statuses.forEach((status) => {
          const existingJob = jobs.find((j) => j.id === status.id);
          if (existingJob && existingJob.status !== status.status) {
            // Статус изменился — обновляем
            console.log(`[Polling] ${status.originalFilename}: ${existingJob.status} → ${status.status}`);
            // Обновляем в store (метод зависит от твоей реализации)
          }
        });
      } catch (error) {
        console.error('[Polling Error]:', error);
        // Не прерываем polling, просто логируем ошибку
      }
    }, interval);
    
    return () => clearInterval(pollInterval);
  }, [jobs, interval, setIsProcessing]);
};
```

---

## 🎨 Стили & Дизайн система

### CSS переменные (Theme)

**Файл: `src/styles/variables.scss`**

```scss
// ⚠️ CRA: SCSS работает out-of-the-box, просто используй файлы .scss

:root {
  // COLORS — Dark theme (из design_brief.md)
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --border-color: #404040;
  
  // ACCENTS
  --accent-color: #4a9eff; // Blue
  --success-color: #4caf50; // Green
  --error-color: #ff6b6b; // Red
  --warning-color: #ffa500; // Orange
  
  // SPACING (8px grid)
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  // TYPOGRAPHY
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
    sans-serif;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 20px;
  
  // BORDER RADIUS
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  
  // SHADOWS
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.2);
}
```

### Reset & Global styles

**Файл: `src/styles/reset.scss`**

```scss
@import './variables.scss';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  background: none;
}

input,
textarea,
select {
  font-family: inherit;
}

a {
  color: var(--accent-color);
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}
```

### Импортирование в приложение

**Файл: `src/index.tsx`** (CRA entry point)

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/reset.scss'; // Импортируем глобальные стили ПЕРВЫМ
import './styles/variables.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### Main App layout

**Файл: `src/App.tsx`**

```typescript
import React, { useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload/FileUpload';
import { Settings } from '@/components/Settings/Settings';
import { ProgressBar } from '@/components/ProgressBar/ProgressBar';
import { ResultsTable } from '@/components/ResultsTable/ResultsTable';
import { Toast } from '@/components/Toast/Toast';
import { useAppStore } from '@/store/useAppStore';
import { usePolling } from '@/hooks/usePolling'; // День 3+: для live updates
import styles from './App.module.scss';

function App() {
  const jobs = useAppStore((state) => state.jobs);
  const isProcessing = useAppStore((state) => state.isProcessing);
  
  // День 3: запускаем polling для live status updates
  // (ждём Backend #20 — GET /status endpoint)
  usePolling(2000);
  
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>📸 Photo Metadata AI</h1>
        <p>Auto-generate metadata for your photos</p>
      </header>
      
      <main className={styles.container}>
        <section className={styles.grid}>
          <div className={styles.column}>
            {/* День 1-2: FileUpload компонент */}
            <FileUpload disabled={isProcessing} />
          </div>
          
          <div className={styles.column}>
            {/* День 1-2: Settings компонент */}
            <Settings />
          </div>
        </section>
        
        {/* День 3+: Показываем прогресс и результаты если есть jobs */}
        {jobs.length > 0 && (
          <>
            {/* День 3-4: Progress bar (ждёт Backend #20) */}
            <ProgressBar />
            
            {/* День 3-4: Results table (ждёт Backend #11) */}
            <ResultsTable />
          </>
        )}
      </main>
      
      {/* День 5-6: Toast notifications для ошибок */}
      <Toast />
    </div>
  );
}

export default App;
```

**Файл: `src/App.module.scss`**

```scss
@import 'styles/variables.scss';

.app {
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, var(--accent-color), #2e5c8a);
  padding: var(--spacing-xl);
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  
  h1 {
    margin: 0 0 8px 0;
    font-size: 32px;
    font-weight: bold;
  }
  
  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
  }
}

.container {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
```

### SCSS Modules в CRA

CRA поддерживает CSS Modules из коробки. Для каждого компонента:

```scss
// src/components/FileUpload/FileUpload.module.scss
@import '@/styles/variables.scss';

.fileUploadContainer {
  width: 100%;
}

.dropZone {
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: var(--bg-secondary);
  
  &:hover:not(.disabled) {
    border-color: var(--accent-color);
    background-color: rgba(74, 158, 255, 0.1);
  }
  
  // ... остальные стили
}
```

**В компоненте:**

```typescript
import styles from './FileUpload.module.scss';

export const FileUpload = () => {
  return <div className={styles.fileUploadContainer}>...</div>;
};
```

---

## 📅 Дневный план с примерами

**⚠️ Помни:** Некоторые frontend задачи БЛОКИРУЮТ на backend. Если backend не готов — используем mock API!

### День 1

**Утро (4 часа):**
```bash
# 09:00 — Setup Create React App + TypeScript (1ч)
cd /path/to/project
npx create-react-app photo-metadata-ai --template typescript
cd photo-metadata-ai
npm install zustand axios
# ✅ npm start работает на localhost:3000

# 10:00 — Types & interfaces (0.5ч)
# src/types/index.ts with ProcessingJob, AppSettings

# 10:30 — Zustand store (1ч)
# src/store/useAppStore.ts (copy from раздела выше)

# 11:30 — Mock API (1ч)
# src/services/api/mockApi.ts
# src/services/api/index.ts (export mockApiService)
```

**День (3 часа):**
```bash
# 13:00 — CSS variables & Global styles (0.5ч)
# src/styles/variables.scss
# src/styles/reset.scss
# Импортируем в src/index.tsx

# 13:30 — Base layout & Theme (1ч)
# src/App.tsx & src/App.module.scss

# 14:30 — FileUpload component (1ч)
# src/components/FileUpload/FileUpload.tsx
# src/components/FileUpload/FileUpload.module.scss

# 15:30 — End of Day 1
```

**Тестирование (в браузере):**
```bash
npm start
# Открой localhost:3000
# Проверь:
# ✅ App компилируется без ошибок
# ✅ FileUpload видно
# ✅ Drag-drop зона видна
# ✅ DevTools Console clean (no errors)
```

**Commits:**
```bash
git commit -m "day1: setup cra + types + store"
git commit -m "day1: fileupload component + theme"
```

---

### День 2

**Цель:** Settings компонент, Base layout polish, готово для дня 3

```bash
# 09:00 — Settings component (2ч)
# src/components/Settings/Settings.tsx & .module.scss
# localStorage integration (loadSettings, saveSettings)

# 11:00 — Styling & Polish (1ч)
# Apply theme to all components
# Responsive check (mobile, tablet, desktop)

# 12:00 — Lunch break

# 13:00 — Mock API testing (1ч)
npm start
# Тестируем FileUpload + Settings с mockApi
# ✅ Можешь перетащить файлы?
# ✅ Settings сохраняются в localStorage?
# ✅ Mock API работает?

# 14:00 — Daily sync with backend 
# ⚠️ ВАЖНО: Проверяем:
# - Backend готов ли выпустить контракт API по #1 (Job model)?
# - Если да → готовимся к Day 3 real API
# - Если нет → продолжаем с mock API на Day 3

# 15:00 — Buffer time (1ч)
```

**Commits:**
```bash
git commit -m "day2: settings component + localStorage"
git commit -m "day2: responsive styling + polish"
```

---

### День 3 (⚠️ КРИТИЧЕСКИЙ день с backend зависимостями)

**Зависит от backend:** 
- ✅ **Backend #3** (Upload endpoint) 
- ✅ **Backend #20** (Status endpoint) 
- ✅ **Backend #11** (Results endpoint)

```bash
# 09:00 — Real API integration (2ч)
# src/services/api/api.ts (real endpoints)
# .env.local with REACT_APP_API_URL=http://localhost:8000
# Переключить import в src/services/api/index.ts на real API

# ЕСЛИ backend НЕ ГОТОВ:
# - Продолжаем с mockApi.ts
# - Переключимся на real API когда он будет готов

# 11:00 — Progress Bar component (2ч)
# src/components/ProgressBar/ProgressBar.tsx
# ✅ Зависит от Backend #20 (GET /status endpoint)

# 13:00 — Lunch break

# 14:00 — Results Table (skeleton) (1ч)
# src/components/ResultsTable/ResultsTable.tsx
# ✅ Зависит от Backend #11 (GET /results endpoint)
# Пока без inline-edit (это день 5)

# 15:00 — Test integration
npm start
# ⚠️ ТЕСТИРУЕМ ВЕСЬ ЦИКЛ:
# 1. Upload файлы
# 2. Видишь ли progress bar с live updates?
# 3. Видишь ли результаты в таблице?
# Если нет → что именно сломалось? Проверь Backend API

# 16:00 — Daily sync with backend
# - Are APIs working?
# - Any CORS issues?
# - Are statuses updating in real-time?
```

**Commits:**
```bash
git commit -m "day3: real api integration (ждали backend)"
git commit -m "day3: progress bar + live updates (polling)"
git commit -m "day3: results table skeleton"
```

---

### День 4

**Цель:** Full upload → process → display flow работает

```bash
# 09:00 — Fix API integration issues (if any) (1ч)
# CORS? Authentication? Response format?

# 10:00 — Inline editing prep (1ч)
# ⚠️ Зависит от Backend #12 (PUT /metadata endpoint)
# Добавляем edit mode to ResultsTable

# 11:00 — Export button (skeleton) (1ч)
# ⚠️ Зависит от Backend #14 (GET /export endpoint)
# Базовая функциональность экспорта

# 12:00 — Lunch break

# 13:00 — Error handling & Toasts (2ч)
# src/store/useToastStore.ts
# src/components/Toast/Toast.tsx
# Интегрируем в API calls (try-catch)

# 15:00 — Polish & Bug fixes (1ч)
# Тестируем сценарии с ошибками
# Что происходит если API вернул 500?
# Что если сеть упала?
```

**Commits:**
```bash
git commit -m "day4: error handling + toast notifications"
git commit -m "day4: inline edit prep + export button"
```

---

### День 5-6 (Финальные компоненты)

**День 5:**
```bash
# 09:00 — Complete inline editing (2ч)
# ✅ Зависит от Backend #12
# Validation (title 70 chars, description 200 chars, keywords 50)
# API calls + error handling

# 11:00 — CSV export (1ч)
# ✅ Зависит от Backend #14
# Download логика
# Filename generation с timestamp

# 12:00 — Lunch break

# 13:00 — UI polish & responsive (2ч)
# Mobile check (375px - iPhone SE)
# Tablet check (768px)
# Desktop check (1920px)
# Все интерактивные элементы кликабельны

# 15:00 — Buffer (1ч)
```

**День 6:**
```bash
# 09:00 — Final styling pass (2ч)
# Dark theme complete
# Hover states, animations
# Accessibility (a11y) check

# 11:00 — Browser testing (1ч)
npm start
# Открой в: Chrome, Safari, Firefox
# Проверь: нет ли различий?

# 12:00 — Lunch break

# 13:00 — Bug fixes from testing (1.5ч)
# No console errors/warnings
# No memory leaks

# 14:30 — Documentation prep (0.5ч)
# Start writing README.md

# 15:00 — Daily sync: Ready for EXE?
```

**Commits:**
```bash
git commit -m "day5-6: complete inline editing + export"
git commit -m "day5-6: responsive design + styling"
git commit -m "day5-6: bug fixes + polish"
```

---

### День 7 (EXE packaging)

**⚠️ Important:** На этом этапе Web App должна быть полностью готова!

```bash
# 09:00 — Setup Pkg.js (1ч)
npm install --save-dev pkg

# Создать package.json конфиг:
# "pkg": {
#   "assets": ["build/**/*"],
#   "targets": ["win-x64", "macos-x64"]
# }

# 10:00 — Create start script (1ч)
# bin/start.js (запускает frontend dev server)

# 11:00 — Build & test (2ч)
npm run build              # Создаёт build/ папка (CRA production build)
npm run pkg:exe            # Упаковать в EXE

# Тестирование:
# Открой EXE → должен запуститься браузер на localhost:3000

# Если на Windows → тестируй на Windows
# Если на macOS → тестируй на macOS

# 15:00 — End of day
```

**Commits:**
```bash
git commit -m "day7: setup pkg.js + exe packaging"
git commit -m "day7: tested exe on win/mac"
```

---

### День 8 (CLI версия)

**⚠️ Optional:** Если время критично, CLI можно push на post-launch

```bash
# 09:00 — CLI with Commander (3ч)
npm install commander

# bin/cli.ts структура:
# - photo-metadata-ai ~/photos
# - --provider (claude | openai | ollama)
# - --context "Shooting context"
# - --output (csv | json)

# 12:00 — Lunch break

# 13:00 — Test CLI (2ч)
npm link                   # Линкуем локально
photo-metadata-ai ~/test-photos --provider ollama --output csv
# ✅ Работает ли?
# ✅ CSV генерируется в правильном месте?
```

**Commits:**
```bash
git commit -m "day8: cli interface with commander"
git commit -m "day8: tested cli on real photos"
```

---

### День 9-10 (Tests, Docs, Final)

**День 9:**
```bash
# 09:00 — Unit tests (2ч)
npm test -- --watch
# Пишем базовые тесты для:
# - FileUpload компонента
# - Store actions
# - API calls (mock)

# 11:00 — Documentation (2ч)
# README.md (500 слов)
# SETUP.md (детальная инструкция)
# USER_GUIDE.md (для пользователя)

# Пример README структура:
# ## Features
# - Drag-and-drop photo upload
# - AI-powered metadata generation
# - CSV export for photo stocks
# 
# ## Quick Start
# npm start
# 
# ## Deployment
# npm run build  # Build for production
# npm run pkg:exe # Package to EXE
```

**День 10:**
```bash
# 09:00 — Final bug fixes (2ч)
npm start
# Используй app как обычный пользователь
# Что ломается? Что выглядит странно?
# Фиксим самое важное

# 11:00 — Final tests (1ч)
npm test                  # Все тесты проходят?
npm run build             # Build создаётся без ошибок?

# 12:00 — Lunch break

# 13:00 — SOFT LAUNCH (1ч)
# ✅ Web App готова
# ✅ EXE готова
# ✅ CLI готова (или готовится)
# ✅ Документация написана
# 
# Деплой первым 10 тестерам!
```

**Final Commits:**
```bash
git commit -m "day9-10: unit tests + documentation"
git commit -m "day9-10: final bug fixes + polish"
git commit -m "day9-10: ready for soft launch 🚀"
git tag -a v1.0.0-mvp -m "MVP soft launch"
```

---

## ✅ Тестирование

### Локальное тестирование (Development):

```bash
# Start dev server
cd frontend/
npm start            # localhost:3000 с hot reload

# Во время разработки:
# 1. Открой DevTools (F12)
# 2. Console tab → нет ли ошибок?
# 3. Network tab → API запросы OK?
# 4. React DevTools → store updates OK?

# Тестируй критические сценарии:
✅ FileUpload: Drag-drop папка с 50+ файлами
✅ Progress: Live обновляются статусы?
✅ Results: Таблица отображается правильно?
✅ Inline edit: Можешь ли редактировать title, description, keywords?
✅ Export: CSV скачивается с правильным названием?
✅ Settings: Выбор AI provider сохраняется?
✅ Error: Что происходит при ошибке API?
```

### Jest Unit Tests (День 9-10)

CRA уже включает Jest и React Testing Library. Просто пиши тесты!

```bash
npm test              # Запустить jest в watch mode
npm test -- --coverage  # Видеть coverage

# Пример теста: src/__tests__/store.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';

describe('useAppStore', () => {
  it('should add jobs', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.addJobs([
        {
          id: 'test-1',
          filename: 'test.jpg',
          originalFilename: 'test.jpg',
          status: 'queued',
        },
      ]);
    });
    
    expect(result.current.jobs).toHaveLength(1);
  });

  it('should update job status', () => {
    const { result } = renderHook(() => useAppStore());
    
    act(() => {
      result.current.addJobs([
        { id: 'test-1', filename: 'test.jpg', originalFilename: 'test.jpg', status: 'queued' },
      ]);
      result.current.updateJobStatus('test-1', 'processing');
    });
    
    expect(result.current.jobs[0].status).toBe('processing');
  });
});
```

### Component Tests:

```typescript
// src/__tests__/components/FileUpload.test.tsx
import { render, screen } from '@testing-library/react';
import { FileUpload } from '@/components/FileUpload/FileUpload';

describe('FileUpload Component', () => {
  it('should render upload zone', () => {
    render(<FileUpload />);
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument();
  });

  it('should be disabled when processing', () => {
    render(<FileUpload disabled={true} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
```

### Browser Testing Checklist:

```
✅ Chrome (latest)
  - npm start
  - Все компоненты видны?
  - No console errors?

✅ Safari (if on macOS)
  - Стили применяются правильно?
  - Drag-drop работает?

✅ Firefox (optional)
  - Поддержка всех функций?
  - SCSS модули работают?

✅ Mobile (DevTools)
  - iPhone SE (375px) — таблица responsive?
  - iPad (768px) — всё видно?
  - Все кнопки кликабельны (48px min height)?
```

---

## 🚀 Деплой (EXE, CLI)

### Build для Production (CRA)

```bash
# Clean build
npm run build              # → build/ папка (оптимизирована)

# Тестируем production build локально
npm install -g serve      # Простой static server
serve -s build -l 5000
# Открой localhost:5000 — работает ли как на dev?
```

### EXE Packaging (День 7)

**Setup:**

```bash
npm install --save-dev pkg

# package.json добавляем:
{
  "scripts": {
    "build": "react-scripts build",
    "pkg:exe": "npm run build && pkg . --targets win-x64,macos-x64 --output dist/photo-metadata-ai"
  },
  "pkg": {
    "assets": ["build/**/*"],
    "targets": ["win-x64", "macos-x64"],
    "output": "dist/photo-metadata-ai"
  }
}
```

**Start script для EXE:**

**Файл: `bin/start.js`**

```javascript
#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const open = require('open'); // npm install open

// Путь к build папке (в EXE она будет встроена)
const buildDir = path.join(__dirname, '../build');

// Запускаем simple HTTP server для serving static files
const server = spawn('npx', ['serve', '-s', buildDir, '-l', '3000'], {
  stdio: 'inherit',
  shell: true,
});

// Ждём пока сервер стартует, потом открываем браузер
setTimeout(() => {
  open('http://localhost:3000');
}, 2000);

// При exit приложения, убиваем сервер
process.on('exit', () => {
  server.kill();
});

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
```

**Build & Package:**

```bash
# 1. Build production
npm run build

# 2. Установи зависимости для pkg
npm install

# 3. Упакуй в EXE
npm run pkg:exe

# 4. Результаты в dist/ папке:
# dist/photo-metadata-ai-win-x64.exe
# dist/photo-metadata-ai-macos-x64 (binary)
```

**Тестирование EXE:**

```bash
# На Windows:
dist/photo-metadata-ai-win-x64.exe
# Должен: запуститься браузер на localhost:3000

# На macOS:
./dist/photo-metadata-ai-macos-x64
# Должен: запуститься браузер на localhost:3000
```

### CLI Version (День 8)

**Файл: `bin/cli.ts`**

```typescript
#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import fs from 'fs';
import { apiService } from '../src/services/api/api';

program
  .name('photo-metadata-ai')
  .description('Auto-generate metadata for your photos')
  .version('1.0.0')
  .argument('<directory>', 'Directory with photos')
  .option('-p, --provider <provider>', 'AI provider (ollama, claude, openai)', 'ollama')
  .option('-c, --context <context>', 'Shooting context')
  .option('-o, --output <format>', 'Output format (csv, json)', 'csv')
  .action(async (directory, options) => {
    try {
      console.log(`📸 Processing photos from: ${directory}`);
      console.log(`🤖 Using provider: ${options.provider}`);
      
      // 1. Get all photo files
      const photos = fs.readdirSync(directory)
        .filter((file) => /\.(jpg|jpeg|png)$/i.test(file))
        .map((file) => path.join(directory, file));
      
      if (photos.length === 0) {
        console.error('❌ No photos found in directory');
        process.exit(1);
      }
      
      console.log(`✅ Found ${photos.length} photos`);
      
      // 2. Upload to backend (требует running backend server)
      const photoFiles = photos.map((p) => ({
        path: p,
        file: new File([fs.readFileSync(p)], path.basename(p), { type: 'image/jpeg' }),
      }));
      
      const uploadResponse = await apiService.uploadPhotos(
        photoFiles.map((p) => p.file),
        options.context || '',
        options.provider
      );
      
      console.log(`⏳ Processing ${uploadResponse.jobIds.length} files...`);
      
      // 3. Poll for results
      let allDone = false;
      let attempts = 0;
      const maxAttempts = 60; // 2 min (2sec interval)
      
      while (!allDone && attempts < maxAttempts) {
        const statuses = await apiService.getAllJobsStatus();
        const doneCount = statuses.filter((s) => s.status === 'done' || s.status === 'error').length;
        
        console.log(`[${new Date().toLocaleTimeString()}] Progress: ${doneCount}/${statuses.length}`);
        
        if (doneCount === statuses.length) {
          allDone = true;
        } else {
          await new Promise((r) => setTimeout(r, 2000));
          attempts++;
        }
      }
      
      // 4. Export results
      const csvBlob = await apiService.exportToCSV();
      const outputPath = path.join(directory, 'metadata.csv');
      fs.writeFileSync(outputPath, Buffer.from(await csvBlob.arrayBuffer()));
      
      console.log(`✅ Done! Metadata saved to: ${outputPath}`);
      
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  });

program.parse();
```

**Setup CLI для локального тестирования:**

```bash
# В package.json добавь:
{
  "bin": {
    "photo-metadata-ai": "bin/cli.ts"
  }
}

# Установи зависимость
npm install commander

# Компилируй TypeScript перед использованием
npx tsc bin/cli.ts --target es2020 --module commonjs

# Ссылуй локально для тестирования
npm link

# Теперь можешь использовать:
photo-metadata-ai ~/my-photos --provider claude --context "Wedding 2026"

# Результат: ~/my-photos/metadata.csv
```

---

## 📊 Summary таблица (Days vs Tasks vs Backend Dependencies)

| День | Frontend Task | Backend зависимость | Статус |
|------|----------|-------------------|--------|
| **1-2** | FE-1 to FE-6 | None (mock API) | 🟢 Ready |
| **3** | FE-7 (Progress) | **#20** (Status) | 🔴 Blocked |
| **3** | FE-8 (Results) | **#11** (Results) | 🔴 Blocked |
| **3** | FE-9 (API) | **#3, #20, #11** | 🔴 Blocked |
| **4** | FE-7 to FE-9 (finish) | ✅ #3, #20, #11 ready | 🟢 GO |
| **5** | FE-10 (Inline Edit) | **#12** (Update) | 🔴 Blocked |
| **5** | FE-11 (Export) | **#14** (Export) | 🔴 Blocked |
| **5-6** | FE-12, FE-13 (Polish) | None | 🟢 Ready |
| **7** | FE-14 (EXE) | None | 🟢 Ready |
| **8** | FE-15 (CLI) | API already done | 🟢 Ready |
| **9-10** | FE-16, FE-17, FE-18 | None | 🟢 Ready |

---

## 🎯 GO/NO-GO Checkpoints

### День 3 вечер (CRITICAL):
```
✅ FE-1 to FE-6 completed (FileUpload, Settings, Mock API)
✅ npm start работает без ошибок
? Backend готов ли с #3, #20, #11?
  
IF YES → GO: Начинаем FE-7, FE-8, FE-9 с real API
IF NO  → WAIT: Продолжаем с mock API, синхронизируемся с backend

DECISION: Can we proceed with real API integration?
```

### День 6 вечер (CRITICAL):
```
✅ Full upload → process → display работает end-to-end
✅ Inline editing работает (если backend #12 готов)
✅ CSV export работает (если backend #14 готов)
✅ No critical bugs in web app
? Ready для EXE?

DECISION: Start EXE packaging on Day 7
```

### День 8 вечер (PRE-LAUNCH):
```
✅ Web App stable (Day 1-6)
✅ EXE packaged (Day 7)
✅ CLI ready (Day 8)
✅ Documentation complete
✅ No critical bugs

DECISION: Soft launch to 10 testers on Day 10
```

---

## 📚 Справочные ссылки

### Документы проекта:
- SPRINT_PLAN_10DAYS.md — общий план
- design_brief.md — UI/UX requirements
- feature_list.md — полный список функций
- FRONTEND_GITHUB_ISSUES.md — задачи на доске

### Внешние ресурсы:
- [Zustand docs](https://github.com/pmndrs/zustand)
- [React docs](https://react.dev)
- [TypeScript docs](https://www.typescriptlang.org/docs/)
- [Vite docs](https://vitejs.dev)

---

## 🎯 Контрольные точки (Go/No-Go)

### День 3 вечер:
- [ ] FileUpload работает
- [ ] Settings работают
- [ ] Mock API тестируется
- [ ] Real API интегрируется

### День 6 вечер:
- [ ] Полный цикл (upload → process → export)
- [ ] Inline editing работает
- [ ] Нет критических багов
- [ ] Responsive на мобилке

### День 8 вечер:
- [ ] Web App ✅
- [ ] EXE ✅
- [ ] CLI ✅

---

**Удачи! 🚀 Пиши мне если есть вопросы!**

