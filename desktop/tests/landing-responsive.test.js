'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');
const screensPath = path.resolve(__dirname, '../../docs/landing/screens.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function readScreens() {
  return fs.readFileSync(screensPath, 'utf8');
}

// Одно и то же условие встречается в файле не раз, поэтому склеиваем все
// блоки с ним: правило может лежать в любом из них.
function mediaBlock(html, condition) {
  const escaped = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...html.matchAll(new RegExp(`@media ${escaped} \\{([\\s\\S]*?)\\n  \\}`, 'g'))];
  return blocks.length ? blocks.map((m) => m[1]).join('\n') : null;
}

describe('навигация по разделам доступна на узких экранах', () => {
  test('вместо обрезанной ленты — бургер и та же #nav-links панелью', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 860px)');

    expect(narrow).not.toBeNull();
    // Лента со скроллом обрезала пункты на реальном телефоне.
    expect(narrow).not.toMatch(/\.nav-links\s*\{[^}]*overflow-x:\s*auto/s);
    expect(narrow).toMatch(/\.nav-toggle\s*\{[^}]*display:\s*grid/s);
    expect(narrow).toMatch(/header\.nav-open \.nav-links\s*\{[^}]*display:\s*flex/s);
    expect(narrow).toMatch(/\.nav-links\s*\{[^}]*flex-direction:\s*column/s);
    expect(html).toMatch(/id="nav-toggle"/);
    expect(html).toMatch(/aria-controls="nav-links"/);
    expect(html).toMatch(/aria-expanded="false"/);
  });

  test('шапка одной строки: --header-h снова 64px', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 860px)');

    // scroll-margin-top якорей считается от --header-h.
    expect(narrow).toMatch(/:root\s*\{[^}]*--header-h:\s*64px/s);
  });

  test('ссылки остаются в разметке одним списком', () => {
    const html = readLanding();
    const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/);

    expect(nav).not.toBeNull();
    expect((nav[0].match(/<a /g) || []).length).toBe(5);
  });

  test('на узкой ширине бренд уступает место бургеру, «Скачать» скрыт', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 860px)');

    expect(narrow).toMatch(/\.brand\s*\{[^}]*min-width:\s*0/s);
    expect(narrow).toMatch(/\.brand-name\s*\{[^}]*text-overflow:\s*ellipsis/s);
    // DMG только для macOS — на телефоне кнопки скачивания не показываем.
    expect(narrow).toMatch(/a\[href\*=["']\/releases\/download\/["']\]\s*\{[^}]*display:\s*none/s);
    expect(narrow).toMatch(/\.cta-note\s*\{[^}]*display:\s*none/s);
    expect(narrow).not.toMatch(/margin-right:\s*118px/);
  });

  test('скрипт открывает и закрывает меню', () => {
    const html = readLanding();

    expect(html).toMatch(/classList\.toggle\('nav-open'/);
    expect(html).toMatch(/aria-expanded/);
    expect(html).toMatch(/event\.key === 'Escape'/);
  });
});

describe('галерея screens не ломается на телефоне', () => {
  test('на узкой ширине «Скачать» скрыт, шапка остаётся в одну строку', () => {
    const html = readScreens();
    const narrow = mediaBlock(html, '(max-width: 720px)');

    expect(narrow).not.toBeNull();
    expect(narrow).toMatch(/a\[href\*=["']\/releases\/download\/["']\]\s*\{[^}]*display:\s*none/s);
    expect(narrow).not.toMatch(/\.nav\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(narrow).not.toMatch(/--header-h:\s*108px/);
  });

  test('галерея сбрасывает minmax(320px), чтобы не было горизонтального скролла', () => {
    const html = readScreens();
    const base = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const narrow = mediaBlock(html, '(max-width: 720px)');

    expect(base).toMatch(/\.gallery\s*\{[^}]*minmax\(320px/s);
    expect(narrow).toMatch(/\.gallery\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  test('лайтбокс на узком экране занимает весь viewport', () => {
    const html = readScreens();
    const narrow = mediaBlock(html, '(max-width: 720px)');

    // Не 100vw: иначе на телефоне снова появляется горизонтальный сдвиг.
    expect(narrow).toMatch(/dialog\.lightbox\s*\{[^}]*width:\s*100%/s);
    expect(narrow).toMatch(/dialog\.lightbox\s*\{[^}]*height:\s*100dvh/s);
    expect(narrow).not.toMatch(/dialog\.lightbox\s*\{[^}]*width:\s*100vw/s);
  });

  test('страницу нельзя утащить влево: intro не раздувает scrollWidth', () => {
    const html = readScreens();
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

    // clip-path: inset(0 -100vw) + overflow: visible давали ~135px лишней ширины.
    expect(css).not.toMatch(/\.intro\s*\{[^}]*clip-path:\s*inset\(0\s+-100vw\)/s);
    expect(css).toMatch(/\.intro\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/overscroll-behavior-x:\s*none/);
  });
});

describe('Safari не зумит страницу из-за горизонтального overscroll', () => {
  test.each([
    ['index.html', readLanding],
    ['screens.html', readScreens],
  ])('%s: clip + overscroll-behavior-x на html и body', (_name, read) => {
    const css = read().slice(read().indexOf('<style>'), read().indexOf('</style>'));

    // hidden в Safari оставляет резину → visualViewport.scale прыгает.
    expect(css).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/html\s*\{[^}]*overscroll-behavior-x:\s*none/s);
    expect(css).toMatch(/body\s*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/body\s*\{[^}]*overscroll-behavior-x:\s*none/s);
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/s);
  });
});

describe('на телефоне убираем aurora героя и мелкие превью', () => {
  test('ореол мокапа скрыт, блок .thumbs спрятан, тени снимка на месте', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 720px)');
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

    expect(narrow).not.toBeNull();
    expect(narrow).toMatch(/\.hero::before,\s*\n\s*\.hero-visual::after\s*\{\s*display:\s*none/);
    expect(narrow).toMatch(/\.thumbs\s*\{\s*display:\s*none/);
    // Тени большого снимка не сбрасываем на мобиле.
    expect(narrow).not.toMatch(/\.showcase \.shot[\s\S]*?box-shadow:\s*none/);
    expect(css).toMatch(/\.shot\s*\{[^}]*box-shadow:/s);
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

describe('на таче частица не летает', () => {
  test('на coarse pointer снимается с обеих страниц', () => {
    const index = readLanding();
    const screens = readScreens();

    for (const html of [index, screens]) {
      expect(html).toMatch(
        /matchMedia\('\(hover: none\), \(pointer: coarse\)'\)\.matches\) \{\s*if \(particle\) particle\.remove\(\);/s,
      );
    }
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
