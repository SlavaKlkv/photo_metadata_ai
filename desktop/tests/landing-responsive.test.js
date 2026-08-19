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
    const narrow = mediaBlock(html, '(max-width: 1080px)');

    expect(narrow).not.toBeNull();
    // Лента со скроллом обрезала пункты на реальном телефоне.
    expect(narrow).not.toMatch(/\.nav-links\s*\{[^}]*overflow-x:\s*auto/s);
    expect(narrow).toMatch(/\.nav-toggle\s*\{[^}]*display:\s*grid/s);
    expect(narrow).toMatch(/header\.nav-open \.nav-links\s*\{[^}]*display:\s*flex/s);
    expect(narrow).toMatch(/\.nav-links\s*\{[^}]*flex-direction:\s*column/s);
    expect(html).toMatch(/id="nav-toggle"/);
    expect(html).toMatch(/aria-controls="nav-links"/);
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toMatch(/matchMedia\('\(max-width: 1080px\)'\)/);
  });

  test('шапка одной строки: --header-h снова 64px', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 1080px)');

    // scroll-margin-top якорей считается от --header-h.
    expect(narrow).toMatch(/:root\s*\{[^}]*--header-h:\s*64px/s);
  });

  test('ссылки остаются в разметке одним списком', () => {
    const html = readLanding();
    const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/);

    expect(nav).not.toBeNull();
    expect((nav[0].match(/<a /g) || []).length).toBe(5);
  });

  test('на узкой ширине бренд уступает место бургеру и не растягивает зону', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 1080px)');

    expect(narrow).toMatch(/\.brand\s*\{[^}]*min-width:\s*0/s);
    // Зона искр/hover остаётся вокруг локапа, а не заполняет шапку до бургера.
    expect(narrow).toMatch(/\.brand\s*\{[^}]*flex:\s*0 1 auto/s);
    expect(narrow).toMatch(/\.brand\s*\{[^}]*width:\s*max-content/s);
    expect(narrow).not.toMatch(/\.brand\s*\{[^}]*flex:\s*1 1 auto/s);
    expect(narrow).toMatch(/\.brand-name\s*\{[^}]*text-overflow:\s*ellipsis/s);
    // .dmg прячет html.not-mac (mac-desktop.js), не этот media query.
    expect(narrow).not.toMatch(/releases\/download/);
    expect(narrow).not.toMatch(/\.cta-note/);
    expect(narrow).not.toMatch(/margin-right:\s*118px/);
  });

  test('бургер справа от края только без «Скачать»; иначе слева от кнопки', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 1080px)');
    const header = html.match(/<header[\s\S]*?<\/header>/)[0];

    expect(narrow).not.toBeNull();
    // Порядок в разметке: бургер, затем «Скачать» — когда кнопка в шапке.
    expect(header).toMatch(/id="nav-toggle"[\s\S]*class="[^"]*nav-cta/);
    expect(narrow).toMatch(/\.nav-toggle\s*\{[^}]*margin-left:\s*auto/s);
    expect(narrow).not.toMatch(/\.nav-toggle\s*\{[^}]*order:\s*3/s);
    expect(narrow).not.toMatch(/Бургер всегда крайний справа/);
    // Скрытая кнопка не держит слот — иначе бургер не у правого края.
    expect(narrow).toMatch(
      /header\.hero-cta-visible \.nav-cta\s*\{[^}]*position:\s*absolute/s,
    );
    expect(narrow).toMatch(
      /header\.hero-cta-visible \.nav-cta\s*\{[^}]*width:\s*0/s,
    );
  });

  test('скрипт открывает и закрывает меню', () => {
    const html = readLanding();

    expect(html).toMatch(/classList\.toggle\('nav-open'/);
    expect(html).toMatch(/aria-expanded/);
    expect(html).toMatch(/event\.key === 'Escape'/);
  });
});

describe('галерея screens не ломается на телефоне', () => {
  test('на узкой ширине шапка остаётся в одну строку', () => {
    const html = readScreens();
    const narrow = mediaBlock(html, '(max-width: 720px)');

    expect(narrow).not.toBeNull();
    // .dmg больше не завязан на 860px — см. landing-mac-desktop.test.js.
    expect(html).not.toMatch(
      /@media \(max-width: 860px\)[\s\S]*?releases\/download/s,
    );
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
    expect(css).toMatch(/html\s*\{[^}]*overflow-x:\s*clip/s);
    expect(css).toMatch(/overscroll-behavior-x:\s*none/);

    // Пятно движется вместе с контентной колонкой, а не прижимается к viewport.
    const glow = css.match(/\.intro::before\s*\{([^}]*)\}/s);
    expect(glow).not.toBeNull();
    expect(glow[1]).toMatch(/right:\s*-18%/);
    expect(glow[1]).toMatch(/width:\s*min\(100%,\s*var\(--maxw\)\)/);

    // width:100% + right:-18% => центр = 100% + 18% - 50% = 68%.
    const rightPercent = Number(glow[1].match(/right:\s*(-?\d+)%/)[1]);
    expect(1 - rightPercent / 100 - 0.5).toBeCloseTo(0.68);
  });

  test('подсветка intro уходит в поля страницы, а не режется по краю колонки', () => {
    const html = readScreens();
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const intro = css.match(/\n  \.intro\s*\{([^}]*)\}/s);
    expect(intro).not.toBeNull();

    // overflow: hidden резал пятно по яркому месту — под шапкой была видна
    // вертикальная граница. Сверху и снизу хвост по-прежнему обрезан.
    expect(intro[1]).not.toMatch(/overflow:\s*hidden/);
    const clip = intro[1].match(/clip-path:\s*inset\(0\s+-(\d+)px\)/);
    expect(clip).not.toBeNull();
    // Пик aurora scale(1.16): вылет = 0.26×1120 ≈ 291px.
    // Оставляем запас, чтобы мягкий край не резался в правом поле.
    expect(Number(clip[1])).toBeGreaterThanOrEqual(320);
  });

  test('на телефоне подсветка intro скрыта', () => {
    const html = readScreens();
    const narrow = mediaBlock(html, '(max-width: 720px)');

    // Как .hero::before на главной: на узком экране aurora только шумит.
    expect(narrow).toMatch(/\.intro::before\s*\{\s*display:\s*none/);
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

  test('index: ореолы metadata-orbit не раздувают scrollWidth', () => {
    const css = readLanding().slice(
      readLanding().indexOf('<style>'),
      readLanding().indexOf('</style>'),
    );
    expect(css).toMatch(/\.metadata-orbit\s*\{[^}]*overflow-x:\s*clip/s);
  });
});

describe('на таче работает отдельная редкая искра', () => {
  test.each([
    ['index.html', readLanding],
    ['screens.html', readScreens],
  ])('%s: старая россыпь скрыта, мобильная вспышка одноразовая', (_name, read) => {
    const css = read().slice(read().indexOf('<style>'), read().indexOf('</style>'));

    expect(css).toMatch(
      /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.is-mobile-twinkle > \.brand-sparkle:not\(\.brand-sparkle-mobile\)\s*\{[^}]*display:\s*none/s,
    );
    expect(css).toMatch(
      /\.brand-sparkle-mobile\.is-flashing\s*\{[^}]*animation:\s*brand-sparkle-mobile-twinkle 900ms ease-out 1 both/s,
    );
    expect(css).toMatch(/@keyframes brand-sparkle-mobile-twinkle/);
    // Зона — та же, что у рабочего режима: слой не растягиваем на всю шапку.
    expect(css).not.toMatch(/\.brand-sparkles\.is-mobile-twinkle\s*\{[^}]*position:\s*fixed/s);
    expect(css).not.toMatch(
      /\.brand-sparkle-mobile\.is-flashing\s*\{[^}]*infinite/s,
    );
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

  test('на узком экране «Готово для» занимает первую строку целиком', () => {
    const html = readLanding();
    const narrow = mediaBlock(html, '(max-width: 720px)');

    expect(narrow).not.toBeNull();
    // Иначе лейбл остаётся в одной flex-строке с Adobe Stock / Shutterstock.
    expect(narrow).toMatch(/\.platforms \.label\s*\{[^}]*flex-basis:\s*100%/s);
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
