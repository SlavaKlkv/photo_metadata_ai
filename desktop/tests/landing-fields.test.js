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
    'event_date',
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
