'use strict';

const fs = require('fs');
const path = require('path');
const { app, screen } = require('electron');

const PREFERRED_WIDTH = 1600;
const PREFERRED_HEIGHT = 1200;
const WORK_AREA_FRACTION = 0.9;

function stateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function getWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFilePath(), 'utf8'));
    // Окно должно быть видимо на каком-нибудь из текущих дисплеев
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        saved.x >= area.x - saved.width + 100 &&
        saved.x <= area.x + area.width - 100 &&
        saved.y >= area.y &&
        saved.y <= area.y + area.height - 100
      );
    });
    if (visible && saved.width >= 400 && saved.height >= 300) {
      return saved;
    }
  } catch {
    // первого запуска или битого файла достаточно, чтобы взять дефолт
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  return {
    width: Math.min(
      PREFERRED_WIDTH,
      Math.round(workArea.width * WORK_AREA_FRACTION)
    ),
    height: Math.min(
      PREFERRED_HEIGHT,
      Math.round(workArea.height * WORK_AREA_FRACTION)
    ),
    isMaximized: false,
  };
}

function saveWindowState(window) {
  try {
    const bounds = window.getNormalBounds();
    fs.writeFileSync(
      stateFilePath(),
      JSON.stringify({ ...bounds, isMaximized: window.isMaximized() })
    );
  } catch {
    // потеря состояния окна не должна мешать выходу из приложения
  }
}

/**
 * Возвращает окно к дефолтному размеру первого запуска
 * и забывает сохранённое состояние.
 */
function resetWindowState(window) {
  try {
    fs.unlinkSync(stateFilePath());
  } catch {
    // файла может не быть — это нормально
  }
  if (window.isFullScreen()) {
    window.setFullScreen(false);
  }
  if (window.isMaximized()) {
    window.unmaximize();
  }
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(
    PREFERRED_WIDTH,
    Math.round(workArea.width * WORK_AREA_FRACTION)
  );
  const height = Math.min(
    PREFERRED_HEIGHT,
    Math.round(workArea.height * WORK_AREA_FRACTION)
  );
  // Сбрасываем только размер, сохраняя текущее положение окна;
  // при этом не даём новому размеру увести окно за пределы рабочей области.
  const bounds = window.getBounds();
  const x = Math.max(
    workArea.x,
    Math.min(bounds.x, workArea.x + workArea.width - width)
  );
  const y = Math.max(
    workArea.y,
    Math.min(bounds.y, workArea.y + workArea.height - height)
  );
  window.setBounds({ x, y, width, height });
}

module.exports = { getWindowState, saveWindowState, resetWindowState };
