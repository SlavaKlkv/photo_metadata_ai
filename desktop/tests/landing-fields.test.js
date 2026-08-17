'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function fieldsSection(html) {
  return html.match(/<!-- FIELDS -->([\s\S]*?)<!-- MAPPING -->/);
}

function styleSheet(html) {
  return html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
}

// Одно и то же условие встречается в файле не раз, поэтому склеиваем все
// блоки с ним: правило может лежать в любом из них.
function mediaBlock(css, condition) {
  const escaped = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n  \\}`, 'g'))];
  return blocks.length ? blocks.map((m) => m[1]).join('\n') : null;
}

const FIELD_GROUPS = {
  text: ['title', 'description', 'keywords'],
  classification: [
    'categories',
    'license_type',
    'is_illustration',
    'mature_content',
    'ai_disclosure',
  ],
  location: ['sublocation', 'city', 'province_state', 'country'],
  editorial: [
    'is_editorial',
    'editorial_caption',
    'editorial_date',
    'people_count',
    'model_release',
  ],
};

// Ядро блока — 17 полей в четырёх группах: 3 + 5 + 4 + 5. Если что-то
// убрать или переименовать, карточки и детали расходятся.
test('орбита метаданных держит 17 полей в четырёх группах', () => {
  const html = readLanding();
  const fields = fieldsSection(html);

  expect(fields).not.toBeNull();
  expect(fields[1]).toMatch(/<strong>17<\/strong>/);
  expect(fields[1].match(/class="metadata-node"/g)).toHaveLength(4);
  expect(fields[1]).toContain('Текст');
  expect(fields[1]).toContain('Классификация');
  expect(fields[1]).toContain('Локация');
  expect(fields[1]).toContain('Editorial и права');
  expect(fields[1]).toMatch(/<small>3 поля<\/small>/);
  expect(fields[1]).toMatch(/<small>5 полей<\/small>/);
  expect(fields[1]).toMatch(/<small>4 поля<\/small>/);
  expect(fields[1]).toMatch(/<small>5 полей · по ситуации<\/small>/);
});

test('детали со всеми 17 полями свёрнуты по умолчанию и перечисляют имена', () => {
  const html = readLanding();
  const fields = fieldsSection(html);
  const details = fields[1].match(/<details class="field-details">([\s\S]*?)<\/details>/);

  expect(details).not.toBeNull();
  expect(fields[1]).not.toMatch(/<details class="field-details"[^>]*\sopen(?:\s|>)/);

  const fieldNames = Object.values(FIELD_GROUPS).flat();
  const listed = [...details[1].matchAll(/<span\b[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]);

  expect(listed).toEqual(fieldNames);
  expect(details[1].match(/class="maybe"/g)).toHaveLength(5);
});

test('блок обещает оба результата экспорта: CSV и IPTC', () => {
  const html = readLanding();
  const fields = fieldsSection(html);
  const delivery = fields[1].match(/<p class="metadata-delivery">([\s\S]*?)<\/p>/);

  expect(delivery).not.toBeNull();
  expect(delivery[1]).toContain('CSV');
  expect(delivery[1]).toContain('IPTC');
});

test('поля связаны с группами орбиты: hover стопит автоподсветку и акцент по data-group', () => {
  const html = readLanding();
  const fields = fieldsSection(html);
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

  Object.entries(FIELD_GROUPS).forEach(([group, names]) => {
    expect(fields[1]).toMatch(
      new RegExp(`class="metadata-node" data-group="${group}"`),
    );
    names.forEach((name) => {
      expect(fields[1]).toMatch(
        new RegExp(`data-group="${group}">${name}<\\/span>`),
      );
    });
  });

  // Пока курсор над pill — общий цикл категорией гасится.
  expect(css).toMatch(
    /#fields:has\(\.field-cloud \[data-group\]:hover\) \.metadata-node::before/,
  );
  expect(css).toMatch(
    /#fields:has\(\.field-cloud \[data-group\]:hover\) \.metadata-node h3[\s\S]*?animation:\s*none/,
  );

  // Конкретная группа активируется из pill с тем же data-group.
  ['text', 'classification', 'location', 'editorial'].forEach((group) => {
    expect(css).toMatch(
      new RegExp(
        `#fields:has\\(\\.field-cloud \\[data-group="${group}"\\]:hover\\) ` +
          `\\.metadata-node\\[data-group="${group}"\\]`,
      ),
    );
  });

  // Само pill: нейтральный lift (фон + обводка), без фиолетового tint.
  const pillHover = css.match(/\.field-cloud span:hover\s*\{([^}]*)\}/);
  expect(pillHover).not.toBeNull();
  expect(pillHover[1]).toMatch(/border-color:/);
  expect(pillHover[1]).toMatch(/background:/);
  expect(pillHover[1]).toMatch(/transform:/);
  expect(pillHover[1]).not.toMatch(/(?:^|[^\w-])color:/);
  expect(pillHover[1]).not.toMatch(
    /139,\s*136,\s*248|170,\s*168,\s*255|129,\s*125,\s*240/,
  );
  expect(css).toMatch(/\.field-cloud span\s*\{[^}]*transition:/s);
});

test('ниже 1000px лучи и фоновая подсветка групп уходят вместе', () => {
  const css = styleSheet(readLanding());
  const narrow = mediaBlock(css, '(max-width: 1000px)');

  expect(narrow).not.toBeNull();
  // Луч в 31% орбиты дотягивается до подписи, только пока орбита держит
  // проектные 960px. Ниже — лучи режут круг, поэтому уходят вместе с ореолом.
  expect(narrow).toMatch(/\.metadata-ray\s*\{\s*display:\s*none;?\s*\}/);
  // content: none снимает псевдоэлемент целиком, поэтому и автоцикл, и
  // подсветка от pill остаются без фона — opacity в других правилах не оживит.
  expect(narrow).toMatch(/\.metadata-node::before\s*\{\s*content:\s*none;?\s*\}/);
  // Исчезновение декора не должно перестраивать диаграмму.
  expect(narrow).not.toMatch(/\.metadata-orbit\s*\{[^}]*display:\s*grid/s);
  expect(narrow).not.toMatch(/\.metadata-core\s*\{[^}]*order:/s);
  // Орбита сжимается вместе с окном, иначе подписи уезжают к краям колонки.
  expect(narrow).toMatch(/\.metadata-orbit\s*\{[^}]*width:\s*min\(100%, 720px\)/s);

  // Порог по ширине, а не по типу ввода: ландшафт телефона шире 720px, а
  // тач-планшет шире 1000px должен получать ту же радиальную схему, что и десктоп.
  const touch = mediaBlock(css, '(hover: none), (pointer: coarse)');
  expect(touch).not.toMatch(/\.metadata-ray|\.metadata-node/);

  // Буквы по-прежнему подсвечиваются: цикл заголовка не выключаем.
  expect(narrow).not.toMatch(/\.metadata-node h3\s*\{[^}]*animation/s);
  expect(css).toMatch(/\.metadata-node h3\s*\{[^}]*animation:\s*metadata-label-glow/s);
});

test('круг 17 полей центрирован в обеих раскладках орбиты', () => {
  const css = styleSheet(readLanding());
  const core = css.match(/\n  \.metadata-core\s*\{([^}]*)\}/);
  const compact = mediaBlock(css, '(max-width: 720px)');

  expect(core).not.toBeNull();
  expect(core[1]).toMatch(/left:\s*50%/);
  expect(core[1]).toMatch(/transform:\s*var\(--metadata-core-final-transform\)/);
  expect(core[1]).toMatch(/--metadata-core-final-transform:\s*translate\(-50%,\s*-50%\)/);

  // В сетке ядро занимает всю строку и центрируется автомаргинами.
  expect(compact).toMatch(/\.metadata-core\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  expect(compact).toMatch(/\.metadata-core\s*\{[^}]*margin:\s*\d+px auto/s);

  // Подписи держатся вокруг центра: колонки по ширине контента, а не 1fr 1fr
  // во всю ширину — иначе круг остаётся один посреди пустоты.
  expect(compact).toMatch(
    /\.metadata-orbit\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, max-content\)\)/s,
  );
  expect(compact).toMatch(/\.metadata-orbit\s*\{[^}]*justify-content:\s*center/s);

  // При столкновении подписей схема не меняется: верхняя пара, круг, нижняя пара.
  expect(compact).toMatch(/\.metadata-core\s*\{[^}]*order:\s*2/s);
  expect(compact).toMatch(
    /\.metadata-node:nth-of-type\(2\), \.metadata-node:nth-of-type\(3\)\s*\{\s*order:\s*1/,
  );
  expect(compact).toMatch(
    /\.metadata-node:nth-of-type\(4\), \.metadata-node:nth-of-type\(5\)\s*\{\s*order:\s*3/,
  );
});
