'use strict';

const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const screenshotsDir = path.resolve(__dirname, '../../docs/screenshots');

const landingPages = ['index.html', 'screens.html'];

function screenshotRefs(html) {
  const refs = [];
  const patterns = [
    /src="\.\.\/screenshots\/([^"]+\.png)"/g,
    /data-src="\.\.\/screenshots\/([^"]+\.png)"/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      refs.push(match[1]);
    }
  }
  return refs;
}

describe('ссылки на скриншоты указывают на существующие файлы', () => {
  test.each(landingPages)('%s: все ../screenshots/* существуют', (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');
    const refs = screenshotRefs(html);
    expect(refs.length).toBeGreaterThan(0);

    const missing = [...new Set(refs)].filter(
      (name) => !fs.existsSync(path.join(screenshotsDir, name)),
    );
    expect(missing).toEqual([]);
  });
});

// Оригинал 15_exported_file_iptc_metadata.png весит ~11 МБ, поэтому в сетке
// и в карточках грузится уменьшенное превью, а полный размер — только в лайтбоксе.
describe('тяжёлый скриншот IPTC подключается через превью', () => {
  test('превью существует рядом с оригиналом', () => {
    expect(
      fs.existsSync(path.join(screenshotsDir, '15_exported_file_iptc_metadata_1200.png')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(screenshotsDir, '15_exported_file_iptc_metadata.png')),
    ).toBe(true);
  });

  test.each(landingPages)('%s не грузит оригинал в <img>', (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).not.toContain('<img src="../screenshots/15_exported_file_iptc_metadata.png"');
  });

  // Как и у 05: плитке на главной хватает 640 px, сетке экранов нужен 1200 px.
  test('главная грузит плиточное превью, сетка экранов — среднее', () => {
    const index = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
    const screens = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(index).toContain('<img src="../screenshots/15_exported_file_iptc_metadata_640.png"');
    expect(screens).toContain(
      '<img src="../screenshots/15_exported_file_iptc_metadata_1200.png"',
    );
  });

  test('лайтбокс на screens.html открывает полноразмерный оригинал', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toContain('data-src="../screenshots/15_exported_file_iptc_metadata.png"');
  });
});

// При сжатии оригинала 3424 px браузером терялась тонкая рамка панели
// «Context & Settings», поэтому в сетке и карточках грузится уменьшенное превью.
describe('скриншот Context подключается через превью', () => {
  test.each([
    '05_upload_and_context.png',
    '05_upload_and_context_1200.png',
    '05_upload_and_context_640.png',
  ])('%s существует', (name) => {
    expect(fs.existsSync(path.join(screenshotsDir, name))).toBe(true);
  });

  test.each(landingPages)('%s не грузит оригинал в <img>', (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).not.toContain('<img src="../screenshots/05_upload_and_context.png"');
  });

  // Плитка на главной уже ~250 px, поэтому ей нужен свой, более мелкий файл:
  // превью для сетки экранов при таком сжатии снова теряет рамку.
  test('главная грузит плиточное превью, сетка экранов — среднее', () => {
    const index = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
    const screens = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(index).toContain('<img src="../screenshots/05_upload_and_context_640.png"');
    expect(screens).toContain('<img src="../screenshots/05_upload_and_context_1200.png"');
  });

  test('лайтбокс на screens.html открывает полноразмерный оригинал', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toContain('data-src="../screenshots/05_upload_and_context.png"');
  });
});

// У красной рамки обязательной editorial-даты при сжатии оригинала браузером
// пропадали верх, низ и правая грань — карточка грузит уменьшенное превью.
describe('скриншот Editorial-полей подключается через превью', () => {
  test.each([
    '11_select_ready_only.png',
    '11_select_ready_only_1200.png',
  ])('%s существует', (name) => {
    expect(fs.existsSync(path.join(screenshotsDir, name))).toBe(true);
  });

  test.each(landingPages)('%s не грузит оригинал в <img>', (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).not.toContain('<img src="../screenshots/11_select_ready_only.png"');
  });

  test('сетка экранов грузит превью', () => {
    const screens = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(screens).toContain('<img src="../screenshots/11_select_ready_only_1200.png"');
  });

  test('лайтбокс на screens.html открывает полноразмерный оригинал', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toContain('data-src="../screenshots/11_select_ready_only.png"');
  });
});

// Линии сетки в снимке из Numbers — 1 px #a6a6a6: при сжатии оригинала
// браузером они пропадают целиком и таблица читается серой заливкой.
// В карточке грузится превью с перерисованной сеткой.
describe('скриншот готового CSV подключается через превью', () => {
  test.each([
    '14_exported_csv_adobe_stock.png',
    '14_exported_csv_adobe_stock_1200.png',
  ])('%s существует', (name) => {
    expect(fs.existsSync(path.join(screenshotsDir, name))).toBe(true);
  });

  test.each(landingPages)('%s не грузит оригинал в <img>', (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).not.toContain('<img src="../screenshots/14_exported_csv_adobe_stock.png"');
  });

  test('сетка экранов грузит превью', () => {
    const screens = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(screens).toContain('<img src="../screenshots/14_exported_csv_adobe_stock_1200.png"');
  });

  test('лайтбокс на screens.html открывает полноразмерный оригинал', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toContain('data-src="../screenshots/14_exported_csv_adobe_stock.png"');
  });
});

// Онбординг и AI Setup — вертикальные окна; cover при aspect-ratio 4/3
// обрезал бы OpenRouter и поле ключа с ошибкой внизу карточки.
describe('вертикальные диалоги в галерее показываются целиком', () => {
  test('превью 02 и 03 помечены shot-tall', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toMatch(
      /<img class="shot-tall" src="\.\.\/screenshots\/02_onboarding\.png"/,
    );
    expect(html).toMatch(
      /<img class="shot-tall" src="\.\.\/screenshots\/03_ai_setup\.png"/,
    );
  });

  test('для shot-tall задан object-fit: contain', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toMatch(
      /\.gallery img\.shot-tall\s*\{[^}]*object-fit:\s*contain/s,
    );
  });
});

// Высокие PNG в лайтбоксе раньше раздували .lb-body по intrinsic-размеру,
// и .lb-caption оказывалась поверх нижней части снимка.
describe('лайтбокс не даёт подписи наезжать на кадр', () => {
  test('слои абсолютны и укладываются в body, подпись — отдельная flex-полоса', () => {
    const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

    expect(html).toMatch(/\.lb-body\s*\{[^}]*position:\s*relative/s);
    expect(html).toMatch(/\.lb-body img\s*\{[^}]*position:\s*absolute/s);
    expect(html).toMatch(/\.lb-body img\s*\{[^}]*object-fit:\s*contain/s);
    expect(html).toMatch(/\.lb-caption\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
    expect(html).toMatch(/\.lb-caption\s*\{[^}]*border-top:/s);
  });
});
