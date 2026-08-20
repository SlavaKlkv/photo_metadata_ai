const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');

function readPage(name) {
  return fs.readFileSync(path.join(landingDir, name), 'utf8');
}

test('обе страницы используют более контрастные вторичные цвета', () => {
  for (const name of ['index.html', 'screens.html']) {
    const html = readPage(name);

    expect(html).toMatch(/--muted:\s*#adadba/);
    expect(html).toMatch(/--dim:\s*#89899b/);
  }
});

test('галерея разделена на этапы без изменения порядка экранов', () => {
  const html = readPage('screens.html');
  const gallery = html.match(/<div class="gallery" id="gallery">([\s\S]*?)<\/div>\s*<\/main>/)[1];
  const groups = [...gallery.matchAll(/<h2 class="gallery-group">([^<]+) <small>(\d+) экран(?:а|ов)<\/small><\/h2>/g)]
    .map((match) => [match[1], Number(match[2])]);
  const ids = [...gallery.matchAll(/<button type="button" id="(shot-[^"]+)"/g)]
    .map((match) => match[1]);

  expect(groups).toEqual([
    ['Установка', 3],
    ['Обработка', 8],
    ['Экспорт', 4],
  ]);
  expect(ids).toHaveLength(15);
  expect(gallery.indexOf('>Установка <small>')).toBeLessThan(gallery.indexOf('id="shot-01_'));
  expect(gallery.indexOf('>Обработка <small>')).toBeLessThan(gallery.indexOf('id="shot-04_'));
  expect(gallery.indexOf('>Экспорт <small>')).toBeLessThan(gallery.indexOf('id="shot-12_'));
});

test('заголовки этапов занимают всю ширину сетки и адаптированы для телефона', () => {
  const html = readPage('screens.html');

  expect(html).toMatch(/\.gallery-group\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  expect(html).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.gallery-group\s*\{[^}]*font-size:\s*14\.5px/s);
});
