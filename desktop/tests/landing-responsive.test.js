'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

// Одно и то же условие встречается в файле не раз, поэтому склеиваем все
// блоки с ним: правило может лежать в любом из них.
function mediaBlock(html, condition) {
  const escaped = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...html.matchAll(new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n  \\}`, 'g'))];
  return blocks.length ? blocks.map((m) => m[1]).join('\n') : null;
}

describe('навигация по разделам доступна на узких экранах', () => {
  test('ссылки не прячутся, а переносятся лентой со скроллом', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 860px)');

    expect(narrow).not.toBeNull();
    // Прежнее поведение — display: none — оставляло мобильных без навигации.
    expect(narrow).not.toMatch(/\.nav-links\s*\{[^}]*display:\s*none/s);
    expect(narrow).toMatch(/\.nav-links\s*\{[^}]*overflow-x:\s*auto/s);
    expect(narrow).toMatch(/\.nav-links\s*\{[^}]*width:\s*100%/s);
    expect(narrow).toMatch(/\.nav\s*\{[^}]*flex-wrap:\s*wrap/s);
  });

  test('шапка из двух строк учтена в отступе якорей', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 860px)');

    // scroll-margin-top якорей считается от --header-h, иначе заголовок
    // раздела уезжает под выросшую шапку.
    expect(narrow).toMatch(/:root\s*\{[^}]*--header-h:/s);
  });

  test('ссылки остаются в разметке одним списком', () => {
    const html = readLanding();
    const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/);

    expect(nav).not.toBeNull();
    expect((nav[0].match(/<a /g) || []).length).toBe(5);
  });
});

describe('плотные сетки распадаются до того, как станут нечитаемыми', () => {
  test('мастер из пяти шагов переходит в вертикальный таймлайн на 900 px', () => {
    const html = readLanding();
    const block = mediaBlock(html, '(max-width: 900px)');

    expect(block).not.toBeNull();
    expect(block).toMatch(/\.steps\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(block).toMatch(/\.step\s*\{[^}]*grid-template:/s);
  });

  test('три площадки становятся двумя колонками до перехода в одну', () => {
    const html = readLanding();
    const wide = mediaBlock(html, '(max-width: 900px)');
    const narrow = mediaBlock(html, '(max-width: 720px)');

    expect(wide).toMatch(/\.mapping-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
    // Третья карточка занимает всю строку, поэтому вертикальная граница ей не нужна.
    expect(wide).toMatch(/\.mapping-platform:nth-child\(3\)\s*\{[^}]*border-left:\s*0/s);
    expect(narrow).toMatch(/\.mapping-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  test('медиазапросы идут от широких к узким', () => {
    const html = readLanding();
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const widths = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]));
    const tail = widths.slice(widths.indexOf(1000));

    // Иначе более широкий блок перебил бы правила узкого.
    expect(tail).toEqual([...tail].sort((a, b) => b - a));
  });
});

describe('анимация фонового пятна не считает layout каждый кадр', () => {
  test('прямоугольники зон кэшируются и сбрасываются по scroll, resize и toggle', () => {
    const html = readLanding();

    expect(html).toMatch(/if \(!zoneRectsStale && zoneRects\) return zoneRects;/);
    expect(html).toMatch(/addEventListener\('scroll', markZoneRectsStale/);
    expect(html).toMatch(/addEventListener\('resize', markZoneRectsStale/);
    expect(html).toMatch(/addEventListener\('toggle', markZoneRectsStale, true\)/);
  });

  test('elementFromPoint опрашивается по таймеру, а не на каждом кадре', () => {
    const html = readLanding();

    expect(html).toMatch(/if \(time - lastContentProbe > \d+\) \{[\s\S]{0,200}elementFromPoint/);
  });

  test('зоны перечисляют только существующие на странице классы', () => {
    const html = readLanding();
    const selectors = [
      ...(html.match(/var contentZoneSelector =([\s\S]*?);/) || [])[1].matchAll(/\.([\w-]+)/g),
      ...(html.match(/var CONTENT_HIT_SELECTOR =([\s\S]*?);/) || [])[1].matchAll(/\.([\w-]+)/g),
    ].map((m) => m[1]);

    const markup = html.slice(html.indexOf('</style>'));
    const present = new Set();
    for (const attr of markup.match(/class="([^"]*)"/g) || []) {
      attr.slice(7, -1).split(/\s+/).forEach((name) => present.add(name));
    }

    expect([...new Set(selectors)].filter((name) => !present.has(name))).toEqual([]);
  });
});
