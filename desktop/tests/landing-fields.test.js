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

test('лучи сохраняются на всех ширинах и следуют за блоками', () => {
  const html = readLanding();
  const css = styleSheet(html);
  const narrow = mediaBlock(css, '(max-width: 1000px)');

  expect(narrow).not.toBeNull();
  expect(narrow).not.toMatch(/\.metadata-ray\s*\{[^}]*display:\s*none/s);
  expect(css).toMatch(/\.metadata-ray\s*\{[^}]*top:\s*var\(--metadata-ray-y,\s*50%\)/s);
  expect(css).toMatch(/\.metadata-ray\s*\{[^}]*left:\s*var\(--metadata-ray-x,\s*50%\)/s);
  expect(css).toMatch(/\.metadata-ray\s*\{[^}]*width:\s*var\(--metadata-ray-length,\s*31%\)/s);
  expect(css).toMatch(/\.metadata-ray\s*\{[^}]*rotate\(var\(--metadata-ray-angle\)\)/s);
  expect(html).toMatch(/function syncMetadataRays\(\)/);
  expect(html).toMatch(/var distance = Math\.hypot\(dx, dy\)/);
  expect(html).toMatch(/Math\.max\(0, distance - coreRadius\)/);
  expect(html).toMatch(/Math\.atan2\(dy, dx\)/);
  expect(html).toMatch(/new ResizeObserver\(scheduleMetadataRays\)/);
  expect(html).toMatch(/function syncMetadataCenter\(\)/);
  expect(html).toMatch(/function syncMetadataColumns\(\)/);
  expect(html).toMatch(/function metadataDiagramInset\(\)/);
  expect(html).toMatch(/function metadataAdaptiveProgress\(\)/);
  expect(html).toMatch(/Math\.min\(\s*816,\s*window\.innerWidth - metadataDiagramInset\(\) \* 2/s);
  expect(html).toMatch(/var topGap = 35\.3 \+ \(118\.2 - 35\.3\) \* progress/);
  expect(html).toMatch(/var bottomGap = 44\.6 \+ \(120\.9 - 44\.6\) \* progress/);
  expect(html).toMatch(/var columnOutset = Math\.min\(fieldOutset, maximumColumnOutset\)/);
  expect(html).toMatch(/var nodeEdge = Math\.max\(4, Math\.min\(18, window\.innerWidth \* \.05 - 18\)\)/);
  expect(html).toMatch(/rayTrackingUntil = performance\.now\(\) \+ 240/);
  expect(html).toMatch(/range\.selectNodeContents\(element\)/);
  expect(html).toMatch(/--metadata-orbit-shift-x/);
  expect(html).toMatch(/window\.innerWidth >= 1008/);
  expect(html).toMatch(/window\.innerWidth \/ 2 - inkCenter/);
  // content: none снимает псевдоэлемент целиком, поэтому и автоцикл, и
  // подсветка от pill остаются без фона — opacity в других правилах не оживит.
  expect(narrow).toMatch(/\.metadata-node::before\s*\{\s*content:\s*none;?\s*\}/);
  // Отключение только фонового ореола не должно перестраивать диаграмму.
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

test('на широком экране группы сохраняют исходные отступы', () => {
  const css = styleSheet(readLanding());
  const node = css.match(/\n  \.metadata-node\s*\{([^}]*)\}/);
  const narrow = mediaBlock(css, '(max-width: 1000px)');

  expect(node).not.toBeNull();
  expect(node[1]).toMatch(/width:\s*clamp\(/);
  expect(node[1]).toMatch(/var\(--metadata-node-min-width\)/);
  expect(node[1]).toMatch(/260px/);
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(2\)\s*\{[^}]*top:\s*28px;[^}]*left:\s*calc\(var\(--metadata-node-edge\) - var\(--metadata-column-outset\)\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(3\)\s*\{[^}]*top:\s*28px;[^}]*right:\s*calc\(var\(--metadata-node-edge\) - var\(--metadata-column-outset\)\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(4\)\s*\{[^}]*bottom:\s*28px;[^}]*left:\s*calc\(var\(--metadata-node-edge\) - var\(--metadata-column-outset\)\)/s,
  );
  expect(css).toMatch(
    /\.metadata-node:nth-of-type\(5\)\s*\{[^}]*right:\s*calc\(var\(--metadata-node-edge\) - var\(--metadata-column-outset\)\);[^}]*bottom:\s*28px/s,
  );

  expect(narrow).not.toMatch(/\.metadata-node\s*\{[^}]*width:\s*auto/s);
  expect(narrow).toMatch(/\.metadata-node\s*\{[^}]*min-width:\s*0/s);
  expect(narrow).not.toMatch(/right:\s*calc\(50% \+ \(var\(--metadata-core-size\)/);
  expect(narrow).not.toMatch(/left:\s*calc\(50% \+ \(var\(--metadata-core-size\)/);
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

test('при уменьшении ширины все четыре блока сжимаются синхронно', () => {
  const css = styleSheet(readLanding());
  const mid = mediaBlock(css, '(max-width: 1000px)');

  expect(css).toMatch(/\.metadata-node h3\s*\{[^}]*word-break:\s*keep-all/s);
  expect(mid).not.toMatch(/--metadata-node-gap:/);
  expect(css).toMatch(
    /\.metadata-node h3\s*\{[^}]*font-size:\s*clamp\(16px,\s*calc\(8\.5px \+ \.75vw\),\s*17\.5px\)/s,
  );
  expect(css).toMatch(/\.metadata-node small\s*\{[^}]*white-space:\s*nowrap/s);
  expect(css).toMatch(/\.metadata-node small\s*\{[^}]*flex-wrap:\s*nowrap/s);
});

test('на телефоне орбита использует viewport и держит описания в двух строках', () => {
  const css = styleSheet(readLanding());
  const responsive = mediaBlock(css, '(max-width: 1000px)');
  const sharedWrap = mediaBlock(css, '(max-width: 840px)');
  const phone = mediaBlock(css, '(max-width: 440px)');
  const tiny = mediaBlock(css, '(max-width: 380px)');

  expect(css).toMatch(
    /--metadata-orbit-width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/,
  );
  expect(css).toMatch(
    /--metadata-orbit-half-width:\s*min\(480px,\s*calc\(50vw - 24px\)\)/,
  );
  expect(css).toMatch(/\.metadata-orbit\s*\{[^}]*width:\s*var\(--metadata-orbit-width\)/s);
  expect(css).toMatch(
    /\.metadata-orbit\s*\{[^}]*margin:\s*46px 0 0 calc\([^}]*50% - var\(--metadata-orbit-half-width\) \+ var\(--metadata-orbit-shift-x\)[^}]*\)/s,
  );
  expect(responsive).toMatch(/height:\s*clamp\(400px,\s*calc\(360px \+ 6vw\),\s*410px\)/);
  expect(responsive).toMatch(/overflow-x:\s*visible/);
  expect(css).toMatch(
    /--metadata-node-min-width:\s*clamp\(88px,\s*calc\(50vw - 38px\),\s*142px\)/,
  );
  expect(css).toMatch(
    /--metadata-node-edge:\s*clamp\(4px,\s*calc\(5vw - 18px\),\s*18px\)/,
  );
  expect(css).toMatch(
    /\.metadata-node\s*\{[^}]*width:\s*clamp\([^}]*var\(--metadata-node-min-width\)[^}]*260px/s,
  );
  const responsiveNode = responsive.match(/\.metadata-node\s*\{([^}]*)\}/);
  expect(responsiveNode).not.toBeNull();
  expect(responsiveNode[1]).not.toMatch(/(?:^|;)\s*width:/);
  expect(phone).toMatch(/\.metadata-node p\s*\{[^}]*text-wrap:\s*balance/s);
  expect(sharedWrap).toMatch(/\.metadata-node p\s*\{[^}]*max-width:\s*175px/s);
  expect(phone).not.toMatch(/--metadata-node-width|--metadata-bottom-row-height/);
  expect(tiny).toMatch(
    /\.metadata-node small\s*\{[^}]*font-size:\s*clamp\(7px,\s*calc\(-2\.8px \+ 3\.5vw\),\s*10\.5px\)/s,
  );
  expect(tiny).toMatch(
    /\.metadata-node h3\s*\{[^}]*font-size:\s*clamp\(11\.5px,\s*calc\(-1\.1px \+ 4\.5vw\),\s*16px\)/s,
  );
  expect(tiny).toMatch(
    /\.metadata-node p\s*\{[^}]*font-size:\s*clamp\(9\.5px,\s*calc\(2\.05px \+ 2\.66vw\),\s*12\.2px\)/s,
  );
});

test('круг сохраняет исходный масштаб и сжимается только на узком экране', () => {
  const html = readLanding();
  const css = styleSheet(html);
  const scaled = mediaBlock(css, '(max-width: 759px)');
  const dropOne = mediaBlock(css, '(max-width: 780px)');
  const tiny = mediaBlock(css, '(max-width: 480px)');

  expect(html).toMatch(
    /<small>за(?:&nbsp;|\u00a0)<span class="metadata-core-one">один <\/span>проход<\/small>/,
  );
  expect(css).toMatch(
    /\.metadata-orbit\s*\{[^}]*--metadata-core-size:\s*clamp\(104px,\s*calc\(43\.5px \+ 13\.75vw\),\s*148px\)/s,
  );
  expect(css).toMatch(/\.metadata-core\s*\{[^}]*display:\s*grid/s);
  expect(css).toMatch(/\.metadata-core\s*\{[^}]*place-items:\s*center/s);
  expect(css).toMatch(/\.metadata-core strong\s*\{[^}]*font-size:\s*50px/s);
  expect(css).toMatch(/\.metadata-core > span\s*\{[^}]*margin-top:\s*8px/s);
  expect(css).toMatch(/\.metadata-core small\s*\{[^}]*margin-top:\s*5px/s);
  expect(scaled).toMatch(
    /\.metadata-core\s*\{[^}]*--metadata-core-pad:\s*calc\(var\(--metadata-core-size\) \* \.125\)/s,
  );
  expect(scaled).toMatch(
    /\.metadata-core\s*\{[^}]*--metadata-core-gap:\s*calc\(var\(--metadata-core-size\) \* \.045\)/s,
  );
  expect(scaled).toMatch(/\.metadata-core\s*\{[^}]*gap:\s*var\(--metadata-core-gap\)/s);
  expect(scaled).toMatch(/\.metadata-core strong\s*\{[^}]*font-size:\s*calc\(var\(--metadata-core-size\) \* \.32\)/s);
  expect(scaled).toMatch(/\.metadata-core > span\s*\{[^}]*margin-top:\s*0/s);
  expect(scaled).toMatch(/\.metadata-core small\s*\{[^}]*max-width:\s*78%/s);
  expect(dropOne).toMatch(/\.metadata-core-one\s*\{\s*display:\s*none/);
  expect(tiny).toMatch(/\.metadata-core small\s*\{\s*display:\s*none/);
});
