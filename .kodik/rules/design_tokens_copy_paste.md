# 🎨 DESIGN TOKENS & STYLES (для копирования в VSC)

## 1️⃣ CSS Переменные

**Файл: `src/styles/variables.scss`**

```scss
:root {
  // ===== COLORS (Dark Theme из макета) =====
  --bg-primary: #1a1a1a;        // Основной тёмный фон
  --bg-secondary: #2d2d2d;      // Вторичный фон (панели, карты)
  --text-primary: #ffffff;       // Основной текст
  --text-secondary: #b0b0b0;    // Второстепенный текст
  --border-color: #404040;       // Цвет границ
  
  // ===== ACCENTS =====
  --accent-color: #4a9eff;       // Основной цвет (синий)
  --accent-light: #7bb4ff;       // Светлый вариант
  --accent-dark: #2e7cd4;        // Тёмный вариант
  --success-color: #4caf50;      // Зелёный (успех)
  --error-color: #ff6b6b;        // Красный (ошибка)
  --warning-color: #ffa500;      // Оранжевый (предупреждение)
  
  // ===== SPACING (8px grid system) =====
  --spacing-xs: 4px;             // Мини отступы
  --spacing-sm: 8px;             // Маленькие
  --spacing-md: 16px;            // Средние
  --spacing-lg: 24px;            // Большие
  --spacing-xl: 32px;            // Очень большие
  --spacing-2xl: 48px;           // Огромные
  
  // ===== TYPOGRAPHY =====
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
  
  --font-size-xs: 11px;          // Мелкий текст (helper, errors)
  --font-size-sm: 12px;          // Маленький (лейблы)
  --font-size-base: 14px;        // Основной
  --font-size-lg: 16px;          // Большой
  --font-size-xl: 18px;          // Очень большой
  --font-size-2xl: 20px;         // Заголовки
  --font-size-3xl: 24px;         // Большие заголовки
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
  
  // ===== BORDER RADIUS =====
  --radius-sm: 4px;              // Небольшие элементы
  --radius-md: 8px;              // Обычные элементы
  --radius-lg: 12px;             // Панели, карты
  --radius-full: 9999px;         // Круглые кнопки
  
  // ===== SHADOWS (для depth) =====
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.2);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.3);
  
  // ===== TRANSITIONS =====
  --transition-fast: 0.15s ease;
  --transition-normal: 0.3s ease;
  --transition-slow: 0.5s ease;
  
  // ===== Z-INDEX =====
  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-modal-backdrop: 998;
  --z-modal: 999;
  --z-tooltip: 1070;
}

// ===== DARK MODE (опционально, если понадобится) =====
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f0f0f;
    --bg-secondary: #1a1a1a;
    --text-primary: #f5f5f5;
    --text-secondary: #a0a0a0;
    --border-color: #333333;
  }
}
```

---

## 2️⃣ Reset & Global Styles

**Файл: `src/styles/reset.scss`**

```scss
@import './variables.scss';

// ===== BOX MODEL RESET =====
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

*::before,
*::after {
  box-sizing: inherit;
}

// ===== HTML & BODY =====
html,
body {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

// ===== TYPOGRAPHY =====
h1, h2, h3, h4, h5, h6 {
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
}

h1 {
  font-size: var(--font-size-3xl);
}

h2 {
  font-size: var(--font-size-2xl);
}

h3 {
  font-size: var(--font-size-lg);
}

p {
  margin: 0;
  line-height: var(--line-height-relaxed);
}

a {
  color: var(--accent-color);
  text-decoration: none;
  transition: color var(--transition-fast);
  
  &:hover {
    color: var(--accent-light);
    text-decoration: underline;
  }
}

small {
  font-size: var(--font-size-sm);
}

code {
  font-family: var(--font-mono);
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

// ===== FORM ELEMENTS =====
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
  font-size: inherit;
  color: inherit;
}

textarea {
  resize: vertical;
  max-width: 100%;
}

// ===== LISTS =====
ul,
ol {
  list-style: none;
}

// ===== SCROLLBAR (для Chrome) =====
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--radius-sm);
  
  &:hover {
    background: var(--text-secondary);
  }
}

// ===== SELECTION =====
::selection {
  background: var(--accent-color);
  color: white;
}

// ===== FOCUS VISIBLE (для доступности) =====
:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}
```

---

## 3️⃣ Animations

**Файл: `src/styles/animations.scss`**

```scss
// ===== FADE ANIMATIONS =====
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

// ===== SLIDE ANIMATIONS =====
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

@keyframes slideDown {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideLeft {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideRight {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

// ===== SCALE ANIMATIONS =====
@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes scaleOut {
  from {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(0.95);
    opacity: 0;
  }
}

// ===== PULSE ANIMATIONS =====
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
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

// ===== SPIN ANIMATIONS =====
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// ===== BOUNCE ANIMATIONS =====
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

// ===== SHIMMER (для loading skeletons) =====
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}
```

---

## 4️⃣ Utility Classes (опционально)

**Файл: `src/styles/utilities.scss`**

```scss
@import './variables.scss';

// ===== DISPLAY & VISIBILITY =====
.hidden {
  display: none !important;
}

.invisible {
  visibility: hidden !important;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

// ===== FLEXBOX =====
.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.gap-sm {
  gap: var(--spacing-sm);
}

.gap-md {
  gap: var(--spacing-md);
}

.gap-lg {
  gap: var(--spacing-lg);
}

// ===== SPACING =====
.p-sm { padding: var(--spacing-sm); }
.p-md { padding: var(--spacing-md); }
.p-lg { padding: var(--spacing-lg); }

.m-auto { margin: auto; }

// ===== SIZING =====
.w-full { width: 100%; }
.h-full { height: 100%; }

// ===== TEXT =====
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-clamp-1 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }
.line-clamp-2 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.line-clamp-3 { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }

// ===== ANIMATIONS =====
.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}

.animate-slideUp {
  animation: slideUp 0.3s ease-out;
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

---

## 5️⃣ Импортирование в App

**Файл: `src/index.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from './store/useAppStore';

// 🔴 ПОРЯДОК ВАЖЕН! (от базового к специфичному)
import './styles/variables.scss';       // 1. Переменные
import './styles/reset.scss';           // 2. Reset
import './styles/animations.scss';      // 3. Animations
import './styles/utilities.scss';       // 4. Utilities (опционально)

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## 6️⃣ Пример App Layout

**Файл: `src/App.tsx`**

```typescript
import React, { useEffect } from 'react';
import { FileUpload } from '@/components/molecules/FileUpload/FileUpload';
import { SettingsPanel } from '@/components/organisms/SettingsPanel/SettingsPanel';
import { FeatureCards } from '@/components/organisms/FeatureCards/FeatureCards';
import { ProgressModal } from '@/components/organisms/ProgressModal/ProgressModal';
import { BottomStatusBar } from '@/components/molecules/BottomStatusBar/BottomStatusBar';
import { BottomActionBar } from '@/components/organisms/BottomActionBar/BottomActionBar';
import { useAppStore } from '@/store/useAppStore';
import styles from './App.module.scss';

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
```

**Файл: `src/App.module.scss`**

```scss
@import 'styles/variables.scss';

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

// ===== HEADER =====
.header {
  background: linear-gradient(135deg, var(--accent-color), var(--accent-dark));
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.headerContent {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  
  h1 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
  }
  
  p {
    margin: 4px 0 0 0;
    font-size: var(--font-size-sm);
    color: rgba(255, 255, 255, 0.8);
  }
}

.logo {
  font-size: 32px;
  display: flex;
  align-items: center;
}

.icons {
  display: flex;
  gap: var(--spacing-md);
}

.iconBtn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  transition: background var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

// ===== MAIN CONTENT =====
.container {
  flex: 1;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: var(--spacing-lg);
  overflow-y: auto;
}

.grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--spacing-lg);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.content {
  display: flex;
  flex-direction: column;
}

// ===== RESPONSIVE =====
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    order: 2;
  }
  
  .content {
    order: 1;
  }
}

@media (max-width: 640px) {
  .app {
    height: auto;
  }
  
  .header {
    padding: var(--spacing-md);
  }
  
  .headerContent {
    flex-direction: column;
    gap: var(--spacing-md);
  }
  
  .title {
    flex-direction: column;
    text-align: center;
  }
  
  .container {
    padding: var(--spacing-md);
  }
  
  .grid {
    gap: var(--spacing-md);
  }
}
```

---

## 7️⃣ Быстрый стартовый набор (Копируй прямо в VSC!)

### Минимум для день 3:

1. **`src/styles/variables.scss`** — Скопируй весь код выше
2. **`src/styles/reset.scss`** — Скопируй весь код выше
3. **`src/styles/animations.scss`** — Скопируй весь код выше
4. **`src/App.tsx`** и **`src/App.module.scss`** — Скопируй из раздела 6

Потом добавляй компоненты по очереди (Button → Checkbox → Input → Select → ProgressBar → FileUpload → SettingsPanel → ProgressModal).

---

## 8️⃣ Цветовая палитра (для быстрого вспоминания)

```
┌─────────────────────────────┐
│ ФОНЫ                        │
├─────────────────────────────┤
│ --bg-primary:   #1a1a1a     │ (основной тёмный)
│ --bg-secondary: #2d2d2d     │ (вторичный)
│ --border:       #404040     │ (линии)
└─────────────────────────────┘

┌─────────────────────────────┐
│ ТЕКСТ                       │
├─────────────────────────────┤
│ --text-primary:   #ffffff   │ (основной)
│ --text-secondary: #b0b0b0   │ (вторичный)
└─────────────────────────────┘

┌─────────────────────────────┐
│ АКЦЕНТЫ                     │
├─────────────────────────────┤
│ --accent-color:  #4a9eff    │ (синий основной)
│ --success-color: #4caf50    │ (зелёный)
│ --error-color:   #ff6b6b    │ (красный)
│ --warning-color: #ffa500    │ (оранжевый)
└─────────────────────────────┘
```

---

## 9️⃣ Типичные ошибки (и как их избежать)

❌ **Не делай:**
```scss
// Прямо пишешь цвета в компоненты
background: #4a9eff;
color: #ffffff;
```

✅ **Делай:**
```scss
// Используешь переменные
background: var(--accent-color);
color: var(--text-primary);
```

❌ **Не делай:**
```scss
// Разные размеры отступов везде
padding: 12px 14px 16px 18px;
margin: 10px;
```

✅ **Делай:**
```scss
// Используешь spacing grid
padding: var(--spacing-md);
margin: var(--spacing-lg);
```

---

**Готов к копированию!** 📋

Скопируй файлы в VSC и начинай строить компоненты. Порядок:
1. Variables + Reset + Animations
2. Button компонент
3. FileUpload компонент  
4. ProgressModal компонент
5. Дальше по документу

