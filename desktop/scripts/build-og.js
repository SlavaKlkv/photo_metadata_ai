#!/usr/bin/env node
'use strict';

/**
 * Пересобирает OG-картинку лендинга (docs/landing/og.png) из живой разметки
 * главной страницы.
 *
 * Окно приложения на картинке — не отдельный макет, а тот же блок
 * `.hero-visual` из index.html вместе со всеми стилями страницы. Поэтому
 * любая правка мокапа на главной попадает в OG автоматически: пересобрать
 * и не держать две копии одного окна.
 *
 * Запуск: npm run build:og (из desktop/) или node desktop/scripts/build-og.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LANDING_DIR = path.resolve(__dirname, '../../docs/landing');
const INDEX_HTML = path.join(LANDING_DIR, 'index.html');
const OG_PNG = path.join(LANDING_DIR, 'og.png');

// og:image:width / og:image:height в index.html объявлены ровно так.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_SCALE = 2;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
].filter(Boolean);

/** Возвращает содержимое элемента вместе с тегами, балансируя вложенные div. */
function extractDiv(html, openingTag) {
  const start = html.indexOf(openingTag);

  if (start === -1) {
    throw new Error(`В index.html не найден блок ${openingTag}`);
  }

  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;

  let depth = 0;
  let match = tags.exec(html);

  while (match) {
    depth += match[0] === '</div>' ? -1 : 1;

    if (depth === 0) {
      return html.slice(start, match.index + match[0].length);
    }

    match = tags.exec(html);
  }

  throw new Error(`Не закрыт блок ${openingTag}`);
}

const OG_CSS = `
  html, body { margin: 0; padding: 0; }
  body {
    position: relative;
    width: ${OG_WIDTH}px;
    height: ${OG_HEIGHT}px;
    overflow: hidden;
    display: grid;
    grid-template-columns: 46% 54%;
    align-items: center;
  }
  body::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    /* Подсветка повторяет прежнюю OG-картинку: одно пятно над окном с пиком
       около 58% ширины, к краям кадра сходит на нет. Параметры подобраны по
       замерам старого og.png — расхождение по профилям в пределах 4/255. */
    background:
      radial-gradient(38% 56% at 58% 14%, rgba(112, 107, 226, .29), transparent);
  }
  .og-left { position: relative; z-index: 1; padding-left: 58px; }
  .og-brand { display: flex; align-items: center; gap: 21px; margin-bottom: 92px; }
  .og-logo {
    display: grid;
    place-items: center;
    width: 58px;
    height: 58px;
    border: 1px solid rgba(139, 136, 248, .3);
    border-radius: 16px;
    background: rgba(139, 136, 248, .1);
  }
  .og-logo img { width: 38px; height: 38px; }
  .og-brand b {
    color: var(--text);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -.012em;
  }
  .og-left h1 {
    margin: 0;
    color: #fff;
    font-size: 54px;
    font-weight: 800;
    line-height: 1.17;
    letter-spacing: -.026em;
  }
  .og-rule {
    display: block;
    width: 78px;
    height: 4px;
    margin-top: 42px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
  }
  .og-right { position: relative; z-index: 1; }
  /* Ширина подобрана так, чтобы развёрнутое окно вписывалось в кадр по высоте
     с полями: 3D-разворот делает габарит заметно больше самого окна. */
  .og-right .hero-visual {
    width: 566px;
    margin-inline: auto;
    padding: 0;
    transform: translateY(-6px);
  }
`;

/**
 * Собирает HTML OG-картинки: стили и мокап берутся из index.html как есть,
 * пути к ассетам разворачиваются в абсолютные (страница рендерится из temp).
 */
function buildOgHtml(indexHtml = fs.readFileSync(INDEX_HTML, 'utf8')) {
  const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);

  if (!styleMatch) {
    throw new Error('В index.html не найден блок <style>');
  }

  const heroVisual = extractDiv(indexHtml, '<div class="hero-visual">').replace(
    /src="icon\.svg"/g,
    `src="file://${LANDING_DIR}/icon.svg"`,
  );

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Photo Metadata AI — OG</title>
<style>${styleMatch[1]}</style>
<style>${OG_CSS}</style>
</head>
<body>
  <div class="og-left">
    <div class="og-brand">
      <span class="og-logo"><img src="file://${LANDING_DIR}/icon.svg" alt=""></span>
      <b>Photo Metadata AI</b>
    </div>
    <h1>Метаданные<br>для фотостоков<br><span class="grad">за минуты</span></h1>
    <span class="og-rule"></span>
  </div>
  <div class="og-right">
    ${heroVisual}
  </div>
</body>
</html>
`;
}

function findChrome() {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

/** Размеры PNG из IHDR — дешевле, чем тянуть графическую зависимость. */
function readPngSize(file) {
  const header = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');

  try {
    fs.readSync(fd, header, 0, 24, 0);
  } finally {
    fs.closeSync(fd);
  }

  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function render() {
  const chrome = findChrome();

  if (!chrome) {
    const error = new Error(
      'Не найден Chrome. Укажите путь через CHROME_PATH=/путь/к/Chrome.',
    );
    error.code = 'ENOCHROME';
    throw error;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landing-og-'));
  const pagePath = path.join(workDir, 'og.html');
  const shotPath = path.join(workDir, 'og.png');

  fs.writeFileSync(pagePath, buildOgHtml(), 'utf8');

  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      // Анимации входа и «плавания» окна иначе попадут в кадр в случайной фазе.
      '--force-prefers-reduced-motion=reduce',
      '--virtual-time-budget=4000',
      `--force-device-scale-factor=${OG_SCALE}`,
      `--window-size=${OG_WIDTH},${OG_HEIGHT}`,
      `--screenshot=${shotPath}`,
      `file://${pagePath}`,
    ],
    { stdio: 'ignore' },
  );

  const size = readPngSize(shotPath);

  if (size.width !== OG_WIDTH * OG_SCALE || size.height !== OG_HEIGHT * OG_SCALE) {
    throw new Error(
      `Ожидались ${OG_WIDTH * OG_SCALE}×${OG_HEIGHT * OG_SCALE}, ` +
        `получено ${size.width}×${size.height}`,
    );
  }

  fs.copyFileSync(shotPath, OG_PNG);
  fs.rmSync(workDir, { recursive: true, force: true });

  return { path: OG_PNG, ...size };
}

if (require.main === module) {
  try {
    const result = render();
    process.stdout.write(
      `og.png пересобран: ${result.path} (${result.width}×${result.height})\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    // Отдельный код: хук отличает «нечем рендерить» от настоящей поломки.
    process.exit(error.code === 'ENOCHROME' ? 2 : 1);
  }
}

module.exports = { buildOgHtml, extractDiv, findChrome, readPngSize, render };
