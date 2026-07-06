# 🚀 FRONTEND DEVELOPMENT GUIDE (Create React App)
**Photo Metadata AI — 10-дневный спринт (компонентный подход)**

**Версия 2.0** — обновлена для дизайна из Figma (Progress Modal, чёткая компонентная архитектура)

---

## 📋 Содержание

1. [Компонентная архитектура](#-компонентная-архитектура-атомы--молекулы--организмы)
2. [Tech Stack & Setup](#-tech-stack--setup)
3. [Zustand Store (State Management)](#-zustand-store-state-management)
4. [Атомарные компоненты (Day 1-2)](#-атомарные-компоненты-day-1-2)
5. [Молекулярные компоненты (Day 2-3)](#-молекулярные-компоненты-day-2-3)
6. [Организменные компоненты (Day 3+)](#-организменные-компоненты-day-3)
7. [API Integration & Zustand логика](#-api-integration--backend-зависимости)
8. [Дневный план (Day 3 onwards)](#-дневный-план-день-3-onwards)
9. [Деплой (EXE, CLI)](#-деплой-exe-cli)

---

## 🏗️ Компонентная архитектура (Атомы → Молекулы → Организмы)

### Принцип (Atomic Design):

```
┌─ ATOMS (базовые, переиспользуемые)
│  ├── Button
│  ├── Checkbox
│  ├── Input / Textarea
│  ├── Select (Dropdown)
│  └── ProgressBar (прямая линия, не может быть отдельно)
│
├─ MOLECULES (комбинации атомов)
│  ├── FileUpload (Drop zone + инструкция)
│  ├── SettingsGroup (Label + Input/Select + Helper text)
│  ├── InfoCard (иконка + заголовок + описание)
│  ├── MetadataPreview (Filename, Title, Description, Keywords скелеты)
│  └── BottomStatusBar (Workflow steps 1→2→3→4→5)
│
├─ ORGANISMS (полные секции)
│  ├── SettingsPanel (всеSettings вместе)
│  ├── FileUploadSection (FileUpload + инструкция)
│  ├── FeatureCards (4 инфо-карты)
│  ├── ProgressModal (НОВОЕ! Modal с progress 15/100)
│  └── BottomActionBar (Start processing + Export buttons)
│
└─ TEMPLATES (полная страница)
   └── App (header + grid + footer)
```

### Структура папок:

```
frontend/src/
├── components/
│   ├── atoms/                    # Переиспользуемые элементы
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.module.scss
│   │   │   └── Button.types.ts
│   │   ├── Checkbox/
│   │   ├── Input/
│   │   ├── Select/
│   │   ├── ProgressBar/          # Простая линия (15px высота)
│   │   └── Icon/                 # Иконки (gear, play, plus, и т.д.)
│   │
│   ├── molecules/                # Комбинации атомов
│   │   ├── SettingsGroup/        # Label + Input
│   │   ├── FileUpload/           # Drop zone
│   │   ├── InfoCard/             # Иконка + текст
│   │   ├── MetadataPreview/      # Скелеты для preview
│   │   └── BottomStatusBar/      # Workflow steps
│   │
│   ├── organisms/                # Полные секции
│   │   ├── SettingsPanel/        # Левая колонка
│   │   ├── FileUploadSection/    # Правая верх
│   │   ├── FeatureCards/         # 4 карты
│   │   ├── ProgressModal/        # 🆕 MODAL с progress 15/100
│   │   └── BottomActionBar/      # Низ с кнопками
│   │
│   └── templates/
│       └── App/                  # Root layout
│
├── store/
│   ├── useAppStore.ts            # Main state
│   └── useUIStore.ts             # UI state (modal open/close)
│
├── hooks/
│   ├── usePolling.ts
│   └── useLocalStorage.ts
│
├── services/
│   ├── api/
│   │   ├── api.ts               # Real API
│   │   ├── mockApi.ts
│   │   └── index.ts
│   └── export/
│       └── csvExport.ts
│
├── types/
│   ├── index.ts
│   └── api.types.ts
│
├── styles/
│   ├── variables.scss           # CSS переменные (цвета, spacing)
│   ├── theme.scss               # Тёмная тема
│   ├── reset.scss               # CSS reset
│   └── animations.scss          # @keyframes для modal, progress
│
└── index.tsx
```

---

## 🛠️ Tech Stack & Setup

```bash
# Create React App + TypeScript (как было)
npx create-react-app photo-metadata-ai --template typescript
cd photo-metadata-ai
npm install zustand axios

# Запуск
npm start                          # localhost:3000

# Build & Test
npm run build
npm test
```

---

## 💾 Zustand Store (State Management)

**ОБНОВЛЕНО:** добавлена UI логика для Progress Modal.

### `src/store/useAppStore.ts` (main state):

```typescript
import create from 'zustand';

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
  exportFormat: ('csv' | 'iptc' | 'json')[]; // Checkboxes!
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
  updateExportFormat: (format: string, checked: boolean) => void; // Для checkboxes
  
  // Utilities
  getProcessedCount: () => number;  // Done + Error
  getTotalCount: () => number;
  getProgressPercent: () => number; // 0-100
  hasErrors: () => boolean;
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  jobs: [],
  settings: {
    aiProvider: 'claude',
    shootingContext: '',
    exportFormat: ['csv'],
  },
  
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
  
  updateExportFormat: (format, checked) =>
    set((state) => ({
      settings: {
        ...state.settings,
        exportFormat: checked
          ? [...state.settings.exportFormat, format as any]
          : state.settings.exportFormat.filter((f) => f !== format),
      },
    })),
  
  getProcessedCount: () => {
    const { jobs } = get();
    return jobs.filter((j) => j.status === 'done' || j.status === 'error').length;
  },
  
  getTotalCount: () => {
    return get().jobs.length;
  },
  
  getProgressPercent: () => {
    const { jobs } = get();
    if (jobs.length === 0) return 0;
    const processed = jobs.filter((j) => j.status === 'done' || j.status === 'error').length;
    return Math.round((processed / jobs.length) * 100);
  },
  
  hasErrors: () => {
    return get().jobs.some((j) => j.status === 'error');
  },
  
  clearAll: () =>
    set({
      jobs: [],
    }),
}));
```

### `src/store/useUIStore.ts` (UI state):

```typescript
import create from 'zustand';

interface UIState {
  // Progress Modal
  isProgressModalOpen: boolean;
  openProgressModal: () => void;
  closeProgressModal: () => void;
  
  // Toast notifications
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isProgressModalOpen: false,
  openProgressModal: () => set({ isProgressModalOpen: true }),
  closeProgressModal: () => set({ isProgressModalOpen: false }),
  
  toasts: [],
  addToast: (message, type) =>
    set((state) => ({
      toasts: [...state.toasts, { id: Date.now().toString(), message, type }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
```

---

## 🧩 Атомарные компоненты (Day 1-2)

### 1. Button

**`src/components/atoms/Button/Button.tsx`**

```typescript
import React from 'react';
import styles from './Button.module.scss';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, iconPosition = 'left', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${styles.button} ${styles[variant]} ${styles[size]}`}
        {...props}
      >
        {icon && iconPosition === 'left' && <span className={styles.icon}>{icon}</span>}
        {props.children}
        {icon && iconPosition === 'right' && <span className={styles.icon}>{icon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

**`src/components/atoms/Button/Button.module.scss`**

```scss
@import '@/styles/variables.scss';

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  // SIZES
  &.sm {
    padding: 6px 12px;
    font-size: 12px;
  }
  
  &.md {
    padding: 10px 16px;
    font-size: 14px;
  }
  
  &.lg {
    padding: 12px 24px;
    font-size: 14px;
  }
  
  // VARIANTS
  &.primary {
    background: var(--accent-color); // #4a9eff
    color: white;
    
    &:hover:not(:disabled) {
      background: lighten(#4a9eff, 10%);
      transform: translateY(-1px);
    }
    
    &:active:not(:disabled) {
      transform: translateY(0);
    }
    
    &:disabled {
      background: var(--text-secondary);
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  
  &.secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    
    &:hover:not(:disabled) {
      border-color: var(--accent-color);
      background: rgba(74, 158, 255, 0.1);
    }
  }
  
  &.ghost {
    background: transparent;
    color: var(--text-primary);
    
    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
    }
  }
  
  .icon {
    display: inline-flex;
    align-items: center;
  }
}
```

---

### 2. Checkbox

**`src/components/atoms/Checkbox/Checkbox.tsx`**

```typescript
import React from 'react';
import styles from './Checkbox.module.scss';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, indeterminate, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const finalRef = (ref as any) || internalRef;
    
    React.useEffect(() => {
      if (finalRef.current) {
        finalRef.current.indeterminate = indeterminate || false;
      }
    }, [indeterminate, finalRef]);
    
    return (
      <label className={styles.checkboxLabel}>
        <input
          ref={finalRef}
          type="checkbox"
          className={styles.input}
          {...props}
        />
        <span className={`${styles.checkmark} ${indeterminate ? styles.indeterminate : ''}`} />
        {label && <span className={styles.label}>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
```

**`src/components/atoms/Checkbox/Checkbox.module.scss`**

```scss
@import '@/styles/variables.scss';

.checkboxLabel {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  
  &:hover {
    .checkmark {
      border-color: var(--accent-color);
    }
  }
}

.input {
  display: none;
  
  &:checked ~ .checkmark {
    background: var(--accent-color);
    border-color: var(--accent-color);
    
    &::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 10px;
      font-weight: bold;
    }
  }
  
  &:disabled ~ .checkmark {
    background: var(--text-secondary);
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.checkmark {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  transition: all 0.2s;
  
  &.indeterminate {
    background: var(--accent-color);
    border-color: var(--accent-color);
    
    &::after {
      content: '−';
      position: absolute;
      color: white;
      font-size: 12px;
      font-weight: bold;
    }
  }
}

.label {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}
```

---

### 3. Input & Textarea

**`src/components/atoms/Input/Input.tsx`**

```typescript
import React from 'react';
import styles from './Input.module.scss';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helper, error, ...props }, ref) => {
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <input
          ref={ref}
          className={`${styles.input} ${error ? styles.error : ''}`}
          {...props}
        />
        {helper && <small className={styles.helper}>{helper}</small>}
        {error && <small className={styles.errorText}>{error}</small>}
      </div>
    );
  }
);

Input.displayName = 'Input';
```

**`src/components/atoms/Input/Input.module.scss`**

```scss
@import '@/styles/variables.scss';

.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.input {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
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
  
  &.error {
    border-color: #ff6b6b;
  }
}

.helper {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
}

.errorText {
  display: block;
  color: #ff6b6b;
  font-size: 12px;
}
```

**`src/components/atoms/Textarea/Textarea.tsx`** (почти то же самое, но textarea)

```typescript
import React from 'react';
import styles from './Textarea.module.scss';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  charLimit?: number;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helper, charLimit, value, ...props }, ref) => {
    const charCount = String(value || '').length;
    
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <textarea
          ref={ref}
          className={styles.textarea}
          value={value}
          maxLength={charLimit}
          {...props}
        />
        <div className={styles.footer}>
          {helper && <small className={styles.helper}>{helper}</small>}
          {charLimit && (
            <small className={styles.charCount}>
              {charCount}/{charLimit}
            </small>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
```

---

### 4. Select (Dropdown)

**`src/components/atoms/Select/Select.tsx`**

```typescript
import React from 'react';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  options: SelectOption[];
  helper?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, helper, ...props }, ref) => {
    return (
      <div className={styles.container}>
        {label && <label className={styles.label}>{label}</label>}
        <select ref={ref} className={styles.select} {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helper && <small className={styles.helper}>{helper}</small>}
      </div>
    );
  }
);

Select.displayName = 'Select';
```

**`src/components/atoms/Select/Select.module.scss`**

```scss
@import '@/styles/variables.scss';

.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.select {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.2s;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b0b0b0' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 20px;
  padding-right: 32px;
  
  &:focus {
    outline: none;
    border-color: var(--accent-color);
  }
  
  option {
    background: var(--bg-primary);
    color: var(--text-primary);
  }
}

.helper {
  color: var(--text-secondary);
  font-size: 12px;
}
```

---

### 5. ProgressBar (простая линия)

**`src/components/atoms/ProgressBar/ProgressBar.tsx`**

```typescript
import React from 'react';
import styles from './ProgressBar.module.scss';

export interface ProgressBarProps {
  value: number; // 0-100
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, animated = true }) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  
  return (
    <div className={styles.progressBar}>
      <div
        className={`${styles.fill} ${animated ? styles.animated : ''}`}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};
```

**`src/components/atoms/ProgressBar/ProgressBar.module.scss`**

```scss
@import '@/styles/variables.scss';

.progressBar {
  width: 100%;
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--accent-color);
  border-radius: 4px;
  transition: width 0.3s ease;
  
  &.animated {
    animation: progressPulse 2s ease-in-out infinite;
  }
}

@keyframes progressPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}
```

---

## 🧬 Молекулярные компоненты (Day 2-3)

### 1. SettingsGroup

**`src/components/molecules/SettingsGroup/SettingsGroup.tsx`**

```typescript
import React from 'react';
import styles from './SettingsGroup.module.scss';

export interface SettingsGroupProps {
  label: string;
  children: React.ReactNode;
  helper?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({ label, children, helper }) => {
  return (
    <div className={styles.group}>
      <label className={styles.label}>{label}</label>
      {children}
      {helper && <small className={styles.helper}>{helper}</small>}
    </div>
  );
};
```

**`src/components/molecules/SettingsGroup/SettingsGroup.module.scss`**

```scss
@import '@/styles/variables.scss';

.group {
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.helper {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
```

---

### 2. FileUpload (Drop zone)

**`src/components/molecules/FileUpload/FileUpload.tsx`**

```typescript
import React, { useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import styles from './FileUpload.module.scss';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const FileUpload: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const addJobs = useAppStore((state) => state.addJobs);
  const jobs = useAppStore((state) => state.jobs);
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const addToast = useUIStore((state) => state.addToast);
  
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return { valid: false, error: `Формат не поддержан: ${file.type}` };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }
    return { valid: true };
  };
  
  const filesToJobs = (files: File[]) => {
    return files.map((file) => {
      const validation = validateFile(file);
      return {
        id: `${Date.now()}-${Math.random()}`,
        filename: file.name,
        originalFilename: file.name,
        status: validation.valid ? ('queued' as const) : ('error' as const),
        error: validation.error,
        metadata: undefined,
      };
    });
  };
  
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    const jobs = filesToJobs(files);
    
    if (jobs.length > 0) {
      addJobs(jobs);
      openProgressModal(); // Открываем modal сразу!
      addToast(`Загружено ${jobs.length} файлов`, 'info');
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files || []);
    const jobs = filesToJobs(files);
    
    if (jobs.length > 0) {
      addJobs(jobs);
      openProgressModal();
      addToast(`Загружено ${jobs.length} файлов`, 'info');
    }
  };
  
  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropZone} ${dragActive ? styles.active : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={styles.content}>
          <span className={styles.icon}>📸</span>
          <h3>Перетащи фото сюда</h3>
          <p>или нажми чтобы выбрать</p>
          <span className={styles.format}>JPG, PNG • Max 50MB каждый</span>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_FORMATS.join(',')}
          onChange={handleChange}
          className={styles.input}
        />
      </div>
    </div>
  );
};
```

**`src/components/molecules/FileUpload/FileUpload.module.scss`**

```scss
@import '@/styles/variables.scss';

.container {
  width: 100%;
}

.dropZone {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--bg-secondary);
  
  &:hover:not(.disabled) {
    border-color: var(--accent-color);
    background: rgba(74, 158, 255, 0.08);
  }
  
  &.active {
    border-color: var(--accent-color);
    background: rgba(74, 158, 255, 0.15);
    transform: scale(1.02);
  }
}

.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon {
  font-size: 48px;
  line-height: 1;
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

@media (max-width: 640px) {
  .dropZone {
    padding: 32px 16px;
  }
  
  .icon {
    font-size: 36px;
  }
}
```

---

### 3. InfoCard

**`src/components/molecules/InfoCard/InfoCard.tsx`**

```typescript
import React from 'react';
import styles from './InfoCard.module.scss';

export interface InfoCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({ icon, title, description }) => {
  return (
    <div className={styles.card}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
};
```

**`src/components/molecules/InfoCard/InfoCard.module.scss`**

```scss
@import '@/styles/variables.scss';

.card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.icon {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 8px;
  background: rgba(74, 158, 255, 0.1);
  color: var(--accent-color);
  font-size: 24px;
}

.card h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}
```

---

### 4. BottomStatusBar

**`src/components/molecules/BottomStatusBar/BottomStatusBar.tsx`**

```typescript
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import styles from './BottomStatusBar.module.scss';

const WORKFLOW_STEPS = [
  { number: 1, label: 'Upload', key: 'upload' },
  { number: 2, label: 'Context', key: 'context' },
  { number: 3, label: 'Process', key: 'process' },
  { number: 4, label: 'Review', key: 'review' },
  { number: 5, label: 'Export', key: 'export' },
];

export const BottomStatusBar: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const hasJobs = jobs.length > 0;
  
  // Определяем текущий шаг
  let currentStep = 1;
  if (hasJobs) {
    const hasProcessing = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
    const hasDone = jobs.some((j) => j.status === 'done');
    
    if (hasProcessing) currentStep = 3;
    if (hasDone) currentStep = 4;
  }
  
  return (
    <div className={styles.statusBar}>
      {!hasJobs && (
        <div className={styles.empty}>
          <span className={styles.icon}>✨</span>
          <span>Загрузи фото чтобы начать</span>
        </div>
      )}
      
      {hasJobs && (
        <div className={styles.workflow}>
          {WORKFLOW_STEPS.map((step, idx) => (
            <React.Fragment key={step.key}>
              <div
                className={`${styles.step} ${
                  step.number <= currentStep ? styles.completed : ''
                } ${step.number === currentStep ? styles.active : ''}`}
              >
                <span className={styles.number}>{step.number}</span>
              </div>
              
              {idx < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`${styles.line} ${
                    step.number < currentStep ? styles.completed : ''
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
```

**`src/components/molecules/BottomStatusBar/BottomStatusBar.module.scss`**

```scss
@import '@/styles/variables.scss';

.statusBar {
  padding: 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  justify-content: center;
}

.icon {
  font-size: 16px;
}

.workflow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.step {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: bold;
  transition: all 0.3s;
  
  &.completed {
    border-color: var(--accent-color);
    background: var(--accent-color);
    color: white;
  }
  
  &.active {
    border-color: var(--accent-color);
    background: var(--accent-color);
    color: white;
    box-shadow: 0 0 0 6px rgba(74, 158, 255, 0.2);
  }
}

.number {
  display: block;
}

.line {
  width: 40px;
  height: 2px;
  background: var(--border-color);
  margin: 0 -4px;
  transition: background 0.3s;
  
  &.completed {
    background: var(--accent-color);
  }
}
```

---
//TODO
## 🦑 Организменные компоненты (Day 3+)

### 1. ProgressModal (НОВОЕ! Главная особенность)

**`src/components/organisms/ProgressModal/ProgressModal.tsx`**

```typescript
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { ProgressBar } from '@/components/atoms/ProgressBar/ProgressBar';
import { Button } from '@/components/atoms/Button/Button';
import styles from './ProgressModal.module.scss';

export const ProgressModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isProgressModalOpen);
  const closeModal = useUIStore((state) => state.closeProgressModal);
  
  const jobs = useAppStore((state) => state.jobs);
  const processed = useAppStore((state) => state.getProcessedCount());
  const total = useAppStore((state) => state.getTotalCount());
  const percent = useAppStore((state) => state.getProgressPercent());
  
  if (!isOpen) return null;
  
  const isProcessing = jobs.some((j) => j.status === 'queued' || j.status === 'processing');
  
  return (
    <>
      {/* BACKDROP */}
      <div
        className={styles.backdrop}
        onClick={closeModal}
        style={{ animation: `${styles.fadeIn} 0.3s ease-out` }}
      />
      
      {/* MODAL */}
      <div className={styles.modal} style={{ animation: `${styles.slideUp} 0.3s ease-out` }}>
        <div className={styles.header}>
          <h2>Обработка в процессе</h2>
          <button className={styles.closeBtn} onClick={closeModal}>
            ✕
          </button>
        </div>
        
        <div className={styles.content}>
          {/* Progress counter */}
          <div className={styles.counter}>
            <span className={styles.processed}>{processed}</span>
            <span className={styles.separator}>/</span>
            <span className={styles.total}>{total}</span>
          </div>
          
          {/* Progress bar */}
          <ProgressBar value={percent} animated={isProcessing} />
          
          {/* File list */}
          <div className={styles.fileList}>
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className={`${styles.fileItem} ${styles[job.status]}`}>
                <span className={styles.status}>
                  {job.status === 'queued' && '⏳'}
                  {job.status === 'processing' && '⚙️'}
                  {job.status === 'done' && '✓'}
                  {job.status === 'error' && '✕'}
                </span>
                <span className={styles.name}>{job.originalFilename}</span>
              </div>
            ))}
            {jobs.length > 5 && (
              <div className={styles.more}>
                + {jobs.length - 5} ещё
              </div>
            )}
          </div>
          
          {/* Status message */}
          {!isProcessing && (
            <div className={styles.statusMessage}>
              {jobs.some((j) => j.status === 'error')
                ? '⚠️ Некоторые файлы не обработались'
                : '✅ Все файлы обработаны!'}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={closeModal}
            disabled={isProcessing}
          >
            Назад
          </Button>
          <Button
            variant="primary"
            onClick={closeModal}
            disabled={isProcessing}
          >
            Далее к редактированию
          </Button>
        </div>
      </div>
    </>
  );
};
```

**`src/components/organisms/ProgressModal/ProgressModal.module.scss`**

```scss
@import '@/styles/variables.scss';

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 500px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  z-index: 999;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  
  h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
  }
}

.closeBtn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    color: var(--text-primary);
  }
}

.content {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  max-height: 60vh;
}

.counter {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 28px;
  font-weight: bold;
  color: var(--text-primary);
  
  .processed {
    color: var(--accent-color);
  }
  
  .separator {
    color: var(--text-secondary);
    font-size: 20px;
  }
  
  .total {
    color: var(--text-secondary);
  }
}

.fileList {
  margin-top: 20px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fileItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 6px;
  font-size: 12px;
  border-left: 3px solid var(--border-color);
  
  &.queued {
    border-left-color: #ffa500;
  }
  
  &.processing {
    border-left-color: var(--accent-color);
    animation: processingPulse 1.5s infinite;
  }
  
  &.done {
    border-left-color: #4caf50;
  }
  
  &.error {
    border-left-color: #ff6b6b;
  }
  
  .status {
    font-size: 14px;
  }
  
  .name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-secondary);
  }
}

@keyframes processingPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.more {
  padding: 8px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

.statusMessage {
  padding: 12px;
  background: rgba(74, 158, 255, 0.1);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  text-align: center;
}

.actions {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
  
  button {
    flex: 1;
  }
}

@media (max-width: 640px) {
  .modal {
    width: 95%;
    max-width: none;
  }
}
```

---

### 2. SettingsPanel

**`src/components/organisms/SettingsPanel/SettingsPanel.tsx`** (День 1-2)

```typescript
import React, { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Textarea } from '@/components/atoms/Textarea/Textarea';
import { Select } from '@/components/atoms/Select/Select';
import { Checkbox } from '@/components/atoms/Checkbox/Checkbox';
import { SettingsGroup } from '@/components/molecules/SettingsGroup/SettingsGroup';
import styles from './SettingsPanel.module.scss';

export const SettingsPanel: React.FC = () => {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updateExportFormat = useAppStore((state) => state.updateExportFormat);
  
  // Load from localStorage
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
  
  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);
  
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.icon}>⚙️</span>
        <h2>Context & Settings</h2>
      </div>
      
      <p className={styles.description}>
        Эти детали помогут AI генерировать точные метаданные для фото.
      </p>
      
      <SettingsGroup label="Shoot Notes / Event Name">
        <Textarea
          placeholder="Например: Свадьба в Таиланде, май 2026. Спокойная погода, фокус на текстурах..."
          value={settings.shootingContext}
          onChange={(e) => updateSettings('shootingContext', e.target.value)}
          charLimit={200}
        />
      </SettingsGroup>
      
      <SettingsGroup label="Stock Platform">
        <Select
          options={[
            { value: 'getty', label: 'Getty Images' },
            { value: 'shutterstock', label: 'Shutterstock' },
            { value: 'adobe', label: 'Adobe Stock' },
          ]}
          value={settings.aiProvider}
          onChange={(e) => updateSettings('aiProvider', e.target.value)}
        />
      </SettingsGroup>
      
      <SettingsGroup label="Export Format">
        <div className={styles.checkboxGroup}>
          <Checkbox
            label="CSV"
            checked={settings.exportFormat.includes('csv')}
            onChange={(e) => updateExportFormat('csv', e.target.checked)}
          />
          <Checkbox
            label="IPTC"
            checked={settings.exportFormat.includes('iptc')}
            onChange={(e) => updateExportFormat('iptc', e.target.checked)}
          />
          <Checkbox
            label="JSON"
            checked={settings.exportFormat.includes('json')}
            onChange={(e) => updateExportFormat('json', e.target.checked)}
          />
        </div>
      </SettingsGroup>
      
      <SettingsGroup label="AI Provider">
        <Select
          options={[
            { value: 'ollama', label: 'Ollama (локально, быстро)' },
            { value: 'claude', label: 'Claude (Anthropic)' },
            { value: 'openai', label: 'OpenAI (GPT-4)' },
          ]}
          value={settings.aiProvider}
          onChange={(e) => updateSettings('aiProvider', e.target.value)}
        />
      </SettingsGroup>
    </div>
  );
};
```

**`src/components/organisms/SettingsPanel/SettingsPanel.module.scss`**

```scss
@import '@/styles/variables.scss';

.panel {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-color);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  
  .icon {
    font-size: 20px;
  }
  
  h2 {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
  }
}

.description {
  margin: 0 0 24px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.checkboxGroup {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .panel {
    padding: 16px;
  }
}
```

---

### 3. FeatureCards

**`src/components/organisms/FeatureCards/FeatureCards.tsx`** (День 3)

```typescript
import React from 'react';
import { InfoCard } from '@/components/molecules/InfoCard/InfoCard';
import styles from './FeatureCards.module.scss';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI-Powered Metadata',
    description: 'Наш AI анализирует каждое фото и генерирует точные, stock-ready метаданные.',
  },
  {
    icon: '📊',
    title: 'Stock-Optimized',
    description: 'Заголовки, описания и ключевые слова оптимизированы для обнаружения на основных стоках.',
  },
  {
    icon: '📁',
    title: 'IPTC & CSV Export',
    description: 'Встраивай IPTC метаданные и экспортируй CSV для безпроблемной загрузки на платформы.',
  },
  {
    icon: '⚡',
    title: 'Сохрани часы работы',
    description: 'Обрабатывай сотни фото за минуты и сосредоточься на том, что ты делаешь лучше всего.',
  },
];

export const FeatureCards: React.FC = () => {
  return (
    <div className={styles.container}>
      {FEATURES.map((feature, idx) => (
        <InfoCard
          key={idx}
          icon={feature.icon}
          title={feature.title}
          description={feature.description}
        />
      ))}
    </div>
  );
};
```

**`src/components/organisms/FeatureCards/FeatureCards.module.scss`**

```scss
@import '@/styles/variables.scss';

.container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-top: 32px;
  margin-bottom: 32px;
}
```

---

### 4. BottomActionBar

**`src/components/organisms/BottomActionBar/BottomActionBar.tsx`** (День 5)

```typescript
import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { Button } from '@/components/atoms/Button/Button';
import styles from './BottomActionBar.module.scss';

export const BottomActionBar: React.FC = () => {
  const jobs = useAppStore((state) => state.jobs);
  const doneJobs = jobs.filter((j) => j.status === 'done' || j.status === 'error');
  const hasJobs = jobs.length > 0;
  
  const openProgressModal = useUIStore((state) => state.openProgressModal);
  const addToast = useUIStore((state) => state.addToast);
  
  const handleExport = async () => {
    if (doneJobs.length === 0) {
      addToast('Нет файлов для экспорта', 'error');
      return;
    }
    
    // ⏳ Backend #14: Экспорт CSV
    try {
      addToast('Экспортирую...', 'info');
      // const blob = await apiService.exportToCSV();
      // const url = URL.createObjectURL(blob);
      // const a = document.createElement('a');
      // a.href = url;
      // a.download = `metadata-${Date.now()}.csv`;
      // a.click();
      addToast('Готово!', 'success');
    } catch (err) {
      addToast('Ошибка при экспорте', 'error');
    }
  };
  
  return (
    <div className={styles.bar}>
      <Button
        variant="primary"
        onClick={openProgressModal}
        disabled={!hasJobs}
        icon="▶"
      >
        Начать обработку
      </Button>
      
      <Button
        variant="secondary"
        onClick={handleExport}
        disabled={doneJobs.length === 0}
        icon="↓"
      >
        Экспортировать результаты
      </Button>
    </div>
  );
};
```

**`src/components/organisms/BottomActionBar/BottomActionBar.module.scss`**

```scss
@import '@/styles/variables.scss';

.bar {
  display: flex;
  gap: 12px;
  padding: 20px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  
  button {
    flex: 1;
    max-width: 300px;
  }
}

@media (max-width: 640px) {
  .bar {
    flex-direction: column;
    
    button {
      max-width: 100%;
    }
  }
}
```

---

## 🌐 API Integration & Backend зависимости

### День 3+ (FE-3): Real API переключение

**`src/services/api/index.ts`** (единая точка входа):

```typescript
// ⚠️ Day 1-2: Mock API
export { mockApiService as apiService } from './mockApi';

// ✅ Day 3+: Переключаешься на real API когда backend готов
// export { apiService } from './api';
```

Компоненты используют:

```typescript
import { apiService } from '@/services/api'; // Всегда одинаково!
```

**День 3:** когда Backend готов с #3, #20, #11 → меняешь импорт выше.

---

## 📅 Дневный план (День 3 onwards)

### День 3 (СЕГОДНЯ)

**Утро (4ч):**
```bash
# Real API integration (если backend готов)
✅ src/services/api/api.ts (uploadPhotos, getAllJobsStatus)
✅ Переключить импорт в src/services/api/index.ts
✅ Тестировать в браузере

# Если backend НЕ готов:
✅ Продолжать с mockApiService
✅ Добавить polling hook
```

**День (3ч):**
```bash
# Progress Modal
✅ src/components/organisms/ProgressModal/ProgressModal.tsx
✅ useUIStore для modal state
✅ Интегрировать в App.tsx
✅ Тестировать открытие/закрытие modal
```

**Проверка:**
```bash
npm start
# 1. Drag-drop файлы → modal открывается?
# 2. Counter обновляется (15/100)?
# 3. File list видна в modal?
# 4. Progress bar движется?
```

---

### День 4-5

- [ ] Results Table с inline edit (ждёт Backend #12)
- [ ] Export CSV (ждёт Backend #14)
- [ ] Styling polish

---

### День 6-10

- [ ] EXE + CLI
- [ ] Tests & Docs

---

## 🚀 Чеклист на День 3 (для тебя прямо сейчас)

**Что сделать СЕГОДНЯ:**

```
[ ] 1. Скопировать ProgressModal компонент (весь код выше)
[ ] 2. Создать useUIStore.ts в /store
[ ] 3. Добавить ProgressModal в App.tsx
[ ] 4. Обновить Button компонент (если нужны иконки)
[ ] 5. Тестировать drag-drop → modal появляется
[ ] 6. Проверить progress counter (15/100 работает?)

БЛОКЕРЫ:
⚠️ Если backend не готов → продолжай с mockApi
✅ Если backend готов → переключи на real API в index.ts
```

**Что дальше (День 4-5):**

1. Results Table с редактированием (ждёт Backend #12)
2. Export CSV (ждёт Backend #14)

---

Готов? Я создал весь компонентный код выше. Копируй прямо в VSC! 🚀
