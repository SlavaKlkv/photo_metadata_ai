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
  expect(fields[1]).toMatch(
    /за(?:&nbsp;|\u00a0)<span class="metadata-core-one">один <\/span>проход/,
  );
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
  // Орбита продолжает сжиматься с окном — без скачка на 720px.

  // Порог по ширине, а не по типу ввода: ландшафт телефона шире 720px, а
  // тач-планшет шире 1000px должен получать ту же радиальную схему, что и десктоп.
  const touch = mediaBlock(css, '(hover: none), (pointer: coarse)');
  expect(touch).not.toMatch(/\.metadata-ray|\.metadata-node/);

  // Буквы по-прежнему подсвечиваются: цикл заголовка не выключаем.
  expect(narrow).not.toMatch(/\.metadata-node h3\s*\{[^}]*animation/s);
  expect(css).toMatch(/\.metadata-node h3\s*\{[^}]*animation:\s*metadata-label-glow/s);
});

test('категории якорятся внутренней вертикалью от круга', () => {
  const css = styleSheet(readLanding());
  const node = css.match(/\n  \.metadata-node\s*\{([^}]*)\}/);

  expect(node).not.toBeNull();
  expect(node[1]).toMatch(/width:\s*auto/);
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(2\),\s*\n\s*\.metadata-node:nth-of-type\(4\)\s*\{[^}]*text-align:\s*right/s,
  );
  expect(node[1]).toMatch(/min-width:\s*0/);
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(2\),\s*\n\s*\.metadata-node:nth-of-type\(4\)\s*\{[^}]*left:\s*var\(--metadata-node-edge\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(2\),\s*\n\s*\.metadata-node:nth-of-type\(4\)\s*\{[^}]*right:\s*calc\(50% \+ \(var\(--metadata-core-size\) \/ 2\) \+ var\(--metadata-node-gap\)\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(3\),\s*\n\s*\.metadata-node:nth-of-type\(5\)\s*\{[^}]*text-align:\s*left/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(3\),\s*\n\s*\.metadata-node:nth-of-type\(5\)\s*\{[^}]*right:\s*var\(--metadata-node-edge\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(3\),\s*\n\s*\.metadata-node:nth-of-type\(5\)\s*\{[^}]*left:\s*calc\(50% \+ \(var\(--metadata-core-size\) \/ 2\) \+ var\(--metadata-node-gap\)\)/s,
  );
});

test('круг 17 полей центрирован, схема орбиты не ломается на узком', () => {
  const css = styleSheet(readLanding());
  const core = css.match(/\n  \.metadata-core\s*\{([^}]*)\}/);
  const compact = mediaBlock(css, '(max-width: 520px)');

  expect(core).not.toBeNull();
  expect(core[1]).toMatch(/left:\s*50%/);
  expect(core[1]).toMatch(/transform:\s*var\(--metadata-core-final-transform\)/);
  expect(core[1]).toMatch(/--metadata-core-final-transform:\s*translate\(-50%,\s*-50%\)/);

  // Телефонная сетка больше не перестраивает орбиту: блоки остаются у краёв.
  expect(compact).toBeNull();
  expect(css).not.toMatch(/@media \(max-width: 520px\)/);
});

test('когда правые категории начинают ломаться, все блоки сдвигаются к центру', () => {
  const css = styleSheet(readLanding());
  const mid = mediaBlock(css, '(max-width: 860px)');

  expect(css).toMatch(/\.metadata-node h3\s*\{[^}]*word-break:\s*keep-all/s);
  expect(mid).toMatch(/\.metadata-orbit\s*\{[^}]*--metadata-node-gap:\s*clamp\(8px/s);
  expect(mid).toMatch(/\.metadata-node h3\s*\{\s*font-size:\s*16px/);
  expect(mid).toMatch(/\.metadata-node small\s*\{[^}]*white-space:\s*nowrap/s);
  expect(mid).toMatch(/\.metadata-node small\s*\{[^}]*flex-wrap:\s*nowrap/s);
});

test('подпись круга: полная → без «один» → скрыта', () => {
  const html = readLanding();
  const css = styleSheet(html);
  const dropOne = mediaBlock(css, '(max-width: 870px)');
  const tiny = mediaBlock(css, '(max-width: 480px)');

  expect(html).toMatch(
    /<small>за(?:&nbsp;|\u00a0)<span class="metadata-core-one">один <\/span>проход<\/small>/,
  );
  expect(css).toMatch(/\.metadata-orbit\s*\{[^}]*--metadata-core-size:\s*clamp\(104px/s);
  expect(css).toMatch(
    /\.metadata-core\s*\{[^}]*--metadata-core-pad:\s*calc\(var\(--metadata-core-size\) \* \.125\)/s,
  );
  expect(css).toMatch(
    /\.metadata-core\s*\{[^}]*--metadata-core-gap:\s*calc\(var\(--metadata-core-size\) \* \.045\)/s,
  );
  expect(css).toMatch(/\.metadata-core\s*\{[^}]*gap:\s*var\(--metadata-core-gap\)/s);
  expect(css).not.toMatch(/\.metadata-core\s*\{[^}]*gap:\s*clamp\(/s);
  expect(css).toMatch(/\.metadata-core strong\s*\{[^}]*font-size:\s*calc\(var\(--metadata-core-size\) \* \.32\)/s);
  expect(css).toMatch(/\.metadata-core strong\s*\{[^}]*line-height:\s*\.84/s);
  expect(css).toMatch(/\.metadata-core > span\s*\{[^}]*font-size:\s*calc\(var\(--metadata-core-size\) \* \.092\)/s);
  expect(css).not.toMatch(/\.metadata-core > span\s*\{[^}]*margin-top:\s*calc\([^)]*-\./s);
  expect(css).toMatch(/\.metadata-core small\s*\{[^}]*max-width:\s*78%/s);
  expect(dropOne).toMatch(/\.metadata-core-one\s*\{\s*display:\s*none/);
  expect(tiny).toMatch(/\.metadata-core small\s*\{\s*display:\s*none/);
});
