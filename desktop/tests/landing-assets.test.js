'use strict';

const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const landingPages = ['index.html', 'screens.html'];

function readPage(filename) {
  return fs.readFileSync(path.join(landingDir, filename), 'utf8');
}

// Страницы публикуются как GitHub Pages из папки docs/, поэтому всё, на что
// они ссылаются, обязано лежать внутри docs/. Путь вида ../../desktop/... на
// сайте превращается в 404, хотя локально по file:// открывается.
describe('ресурсы страниц не выходят за пределы docs/', () => {
  test.each(landingPages)('%s: ни один src/href не поднимается выше docs/', (filename) => {
    const html = readPage(filename);
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

    const escaping = refs.filter((ref) => {
      if (/^(?:https?:|mailto:|#|data:)/.test(ref)) return false;
      // Страницы лежат в docs/landing, поэтому наверх допустим ровно один шаг.
      const depth = (ref.match(/\.\.\//g) || []).length;
      return depth > 1;
    });

    expect(escaping).toEqual([]);
  });

  test.each(landingPages)('%s: локальные файлы существуют', (filename) => {
    const html = readPage(filename);
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);

    const missing = refs
      .filter((ref) => !/^(?:https?:|mailto:|#|data:)/.test(ref))
      .map((ref) => ref.split('#')[0])
      .filter((ref) => ref && !fs.existsSync(path.join(landingDir, ref)));

    expect([...new Set(missing)]).toEqual([]);
  });
});

// Без width/height браузер не знает пропорций до загрузки файла и верстка
// прыгает, когда снимок доезжает.
describe('изображения объявляют свои размеры', () => {
  test.each(landingPages)('%s: у каждого <img> есть width и height', (filename) => {
    const html = readPage(filename);
    const tags = html.match(/<img\b[^>]*>/g) || [];
    expect(tags.length).toBeGreaterThan(0);

    // Слои лайтбокса получают src из JS, их размер задаёт CSS.
    const sized = tags.filter((tag) => !tag.includes('class="lb-layer"'));
    const withoutSize = sized.filter(
      (tag) => !/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag),
    );

    expect(withoutSize).toEqual([]);
  });

  // Атрибут height — presentational hint: без height: auto он фиксирует высоту
  // и отменяет aspect-ratio, из-за чего плитки и карточки галереи растягивались.
  test.each(landingPages)('%s: глобальное правило img снимает высоту из атрибута', (filename) => {
    const html = readPage(filename);

    expect(html).toMatch(/\n\s*img \{[^}]*height:\s*auto/);
  });
});

// Плитки на главной рендерятся примерно в 250 px, поэтому тянуть в них
// оригиналы на 3424 px (больше мегабайта каждый) незачем.
describe('тяжёлые снимки подключены через уменьшенные копии', () => {
  test.each([
    '06_processing_640.png',
    '13_export_completed_640.png',
    '07_review_metadata_1200.png',
  ])('%s существует', (name) => {
    expect(
      fs.existsSync(path.resolve(__dirname, '../../docs/screenshots', name)),
    ).toBe(true);
  });

  test('главная не грузит оригиналы 06, 07 и 13', () => {
    const html = readPage('index.html');

    expect(html).not.toContain('<img src="../screenshots/06_processing.png"');
    expect(html).not.toContain('<img src="../screenshots/13_export_completed.png"');
    expect(html).not.toContain('<img src="../screenshots/07_review_metadata_preview.png"');
  });

  // Карточка 07 тянула оригинал в 1,6 МБ: «preview» в его имени — часть названия
  // экрана «Metadata Preview», а не суффикс размера, и копию легко не заметить.
  test('сетка экранов не грузит оригинал 07 в карточку', () => {
    const html = readPage('screens.html');

    expect(html).not.toContain('<img src="../screenshots/07_review_metadata_preview.png"');
    expect(html).toContain('<img src="../screenshots/07_review_metadata_1200.png"');
  });

  test('страница скриншотов открывает в лайтбоксе полноразмерные оригиналы', () => {
    const html = readPage('screens.html');

    expect(html).toContain('data-src="../screenshots/06_processing.png"');
    expect(html).toContain('data-src="../screenshots/13_export_completed.png"');
    expect(html).toContain('data-src="../screenshots/07_review_metadata_preview.png"');
  });
});

describe('мета-данные страницы', () => {
  test('og:image объявлен в фактическом размере файла', () => {
    const html = readPage('index.html');

    expect(html).toContain('<meta property="og:image:width" content="2400">');
    expect(html).toContain('<meta property="og:image:height" content="1260">');
  });

  test('главная отдаёт theme-color и карточку SoftwareApplication', () => {
    const html = readPage('index.html');
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    expect(html).toContain('<meta name="theme-color"');
    expect(ld).not.toBeNull();

    const data = JSON.parse(ld[1]);
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.operatingSystem).toMatch(/macOS/);
    expect(data.name).toBe('Photo Metadata AI');
    expect(data.offers).toMatchObject({ '@type': 'Offer', price: '0' });
  });

  test('главная объявляет canonical, og и twitter-карточку на тот же URL и изображение', () => {
    const html = readPage('index.html');
    const pageUrl = 'https://slavaklkv.github.io/photo_metadata_ai/landing/';
    const imageUrl = `${pageUrl}og.png`;

    expect(html).toContain(`<link rel="canonical" href="${pageUrl}">`);
    expect(html).toContain(`<meta property="og:url" content="${pageUrl}">`);
    expect(html).toContain(`<meta property="og:image" content="${imageUrl}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<meta name="twitter:image" content="${imageUrl}">`);
    expect(html).toContain('<link rel="icon" href="icon.svg">');
  });

  test('icon.svg, logo.svg и og.png лежат рядом со страницами', () => {
    expect(fs.existsSync(path.join(landingDir, 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(landingDir, 'logo.svg'))).toBe(true);
    expect(fs.existsSync(path.join(landingDir, 'og.png'))).toBe(true);
  });
});
