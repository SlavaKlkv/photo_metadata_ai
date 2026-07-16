'use strict';

const { app, BrowserWindow, Menu, dialog } = require('electron');

const {
  spawnBackend,
  killOrphanedBackends,
} = require('./backend-process');
const { waitForBackend } = require('./health-check');
const { pipeBackendLogs } = require('./logging');
const {
  getWindowState,
  saveWindowState,
  resetWindowState,
} = require('./window-state');

// Именно localhost, не 127.0.0.1: API-клиент фронтенда по умолчанию
// ходит на http://localhost:8000, и одинаковый origin страницы и API
// избавляет от CORS (см. frontend/src/services/api/api.ts).
const APP_URL = 'http://localhost:8000';

// Авто-обновления нет намеренно: electron-updater на macOS работает
// только с подписанным приложением, а дистрибуция неподписанная.
// Update flow ручной: скачать новый .dmg и заменить приложение —
// данные пользователя живут вне бандла и переживают замену.

let backendProcess = null;
let backendExited = false;
let mainWindow = null;
let quitting = false;

// Вторая копия приложения не запускается: у обеих был бы один порт 8000
// и одно хранилище. Вместо этого фокусируем окно первой копии.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

function createLoadingWindow() {
  const loadingWindow = new BrowserWindow({
    width: 360,
    height: 180,
    resizable: false,
    frame: false,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  loadingWindow.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<body style="margin:0;display:flex;align-items:center;' +
          'justify-content:center;height:100vh;background:#17151f;' +
          'color:#b3a6f7;font-family:-apple-system,sans-serif">' +
          '<p>Запуск Photo Metadata AI…</p></body>'
      )
  );
  return loadingWindow;
}

function createMainWindow() {
  const state = getWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      // Рендерер общается с backend только по HTTP — Node API не нужен
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (state.isMaximized) {
    mainWindow.maximize();
  }
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.loadURL(APP_URL);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function installApplicationMenu() {
  const template = [
    { role: 'appMenu' },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          // Не Alt+цифра: на macOS Option+цифра порождает спецсимвол
          // (зависит от раскладки), и такой акселератор не срабатывает
          label: 'Reset Window Size',
          accelerator: 'Ctrl+Cmd+0',
          click: () => {
            if (mainWindow) {
              resetWindowState(mainWindow);
            }
          },
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showBackendFailureAndQuit(logPath) {
  dialog.showErrorBox(
    'Photo Metadata AI',
    'Не удалось запустить внутренний сервис приложения.\n' +
      `Подробности в логе: ${logPath}`
  );
  app.quit();
}

app.whenReady().then(async () => {
  installApplicationMenu();
  const loadingWindow = createLoadingWindow();

  killOrphanedBackends();
  backendProcess = spawnBackend();
  const logPath = pipeBackendLogs(backendProcess);

  backendProcess.on('exit', (code) => {
    backendExited = true;
    backendProcess = null;
    // Падение до готовности health — ошибка запуска; выход после
    // before-quit — штатное завершение.
    if (!quitting && code !== 0 && code !== null) {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      showBackendFailureAndQuit(logPath);
    }
  });

  const healthy = await waitForBackend(() => backendExited);

  if (!loadingWindow.isDestroyed()) {
    loadingWindow.close();
  }

  if (!healthy) {
    if (!backendExited) {
      showBackendFailureAndQuit(logPath);
    }
    return;
  }

  createMainWindow();
});

app.on('before-quit', () => {
  quitting = true;
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
