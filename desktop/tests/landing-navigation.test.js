'use strict';

const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const indexPath = path.join(landingDir, 'index.html');

test.each(['index.html', 'screens.html'])(
  '%s uses a dark document canvas without cross-document transitions',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toMatch(/html\s*{[^}]*background:\s*var\(--bg\)/);
    expect(html).not.toContain('@view-transition');
    expect(html).not.toContain('::view-transition');
  }
);

// Якоря шапки должны указывать на существующие секции: иначе мобильная
// лента-навигация и desktop-меню ведут в никуда.
test('ссылки шапки ведут на существующие якоря разделов', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/);
  expect(nav).not.toBeNull();

  const hrefs = [...nav[0].matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
  expect(hrefs).toEqual(['#features', '#fields', '#how', '#screens', '#install']);

  for (const href of hrefs) {
    const id = href.slice(1);
    expect(html).toMatch(new RegExp(`id="${id}"`));
  }
});

test('брендовый якорь и hero-ссылка «Как это работает» указывают на существующие цели', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  expect(html).toMatch(/<a class="brand" href="#top">/);
  // #top должен быть у самого начала body (не на <main>): иначе
  // scroll-to-top останавливается под sticky-шапкой, а не у scrollY = 0.
  expect(html).toMatch(
    /<body>\s*(?:<!--[\s\S]*?-->\s*)*<span id="top"[^>]*>\s*<\/span>/
  );
  expect(html).not.toMatch(/<main\b[^>]*\bid="top"/);
  expect(html).toMatch(/class="btn btn-ghost" href="#how"/);
  expect(html).toMatch(/id="how"/);
});

// В шапке — голая метка как в приложении, без тёмной плитки icon.svg.
// Ход лепестков рисуют модули brand-iris/ (d у path), не CSS-трансформ svg.
test.each(['index.html', 'screens.html'])(
  '%s: логотип без плитки значка, двигается только затвор',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toMatch(
      /<span class="brand-logo"[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<svg class="brand-mark"/
    );
    expect(html).toMatch(
      /class="brand-mark"[^>]*viewBox="0 0 31\.875 31\.875"/
    );
    // Никакого CSS-rotate на метке.
    expect(html).not.toMatch(/\.brand-logo:hover \.brand-mark\s*{[^}]*transform:\s*rotate/);
    expect(html).not.toMatch(/\.brand:hover \.brand-mark/);
    // Нет подложки icon.svg в шапке.
    expect(html).not.toMatch(/\.brand-logo\s*{[^}]*#30303A/);
    expect(html).not.toMatch(/\.brand-logo\s*{[^}]*background:\s*linear-gradient/);
    expect(html).not.toMatch(/translate\(97\.6 97\.6\) scale\(26\)/);
    // Solid как в приложении, без градиента метки.
    expect(html).toMatch(/class="brand-blades"[^>]*fill="#9191F3"/);
    expect(html).not.toMatch(/brand-mark-fill|url\(#mark\)/);
    expect(html).not.toMatch(/\.brand:hover img\s*{/);
  }
);

// Hero-мок и OG (через build-og) показывают ту же UI-метку, не favicon-плитку.
test('мок на главной использует logo.svg без плитки', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const mockHead = html.match(/<div class="mock-head">[\s\S]*?<\/div>/);

  expect(mockHead).not.toBeNull();
  expect(mockHead[0]).toMatch(/src="logo\.svg"/);
  expect(mockHead[0]).not.toMatch(/icon\.svg/);
});

// logo.svg — единственный файл метки: solid #9191F3, без rect-подложки.
test('logo.svg — solid-метка без плитки и градиента', () => {
  const logo = fs.readFileSync(path.join(landingDir, 'logo.svg'), 'utf8');

  expect(logo).toMatch(/fill="#9191F3"/);
  expect(logo).not.toMatch(/linearGradient|<rect\b|30303A|AAA8FF|7D7DEE/);
});

// Затвор оживляют модули brand-iris/: он подменяет d у метки, а разметка обязана
// дать ему точку опоры и остаться валидной без скрипта.
test.each(['index.html', 'screens.html'])(
  '%s: метка размечена под диафрагму и скрипт подключён',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toMatch(/<path class="brand-blades" d="M8\.32812/);
    // Ирис разнесён по модулям: геометрия, ход, handoff, присутствие, сборка.
    ['geometry', 'motion', 'handoff', 'presence', 'init'].forEach((name) => {
      expect(html).toContain(`<script src="brand-iris/${name}.js"></script>`);
    });
    // Заливкой центр не закрывают: диафрагма всегда остаётся контурной.
    expect(html).not.toMatch(/brand-mark-iris/);
  }
);

// Надпись отзывается на наведение вместе с затвором, но только цветом:
// любая правка ширины сдвигала бы соседние пункты шапки.
test.each(['index.html', 'screens.html'])(
  '%s: wordmark подсвечивается при наведении, не двигая соседей',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toContain('<span class="brand-name">Photo Metadata AI</span>');
    const rule = html.match(
      /\.brand:hover \.brand-name,\s*\n\s*\.brand:focus-visible \.brand-name\s*{([^}]*)}/
    );
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/color:\s*#fff/);
    expect(rule[1]).not.toMatch(/letter-spacing|font-size|padding|margin/);
  }
);

// prefers-reduced-motion гасит и ход затвора (через brand-iris/), и
// подсветку надписи.
test.each(['index.html', 'screens.html'])(
  '%s: анимация логотипа выключена при reduced motion',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');
    const reduced = html.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\n  }/
    );

    expect(reduced).not.toBeNull();
    expect(reduced[0]).toMatch(
      /\.brand:hover \.brand-name,\s*\n\s*\.brand:focus-visible \.brand-name\s*{[^}]*text-shadow:\s*none/
    );
  }
);
