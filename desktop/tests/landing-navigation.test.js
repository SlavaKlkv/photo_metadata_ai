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
  expect(html).toMatch(/id="top"/);
  expect(html).toMatch(/class="btn btn-ghost" href="#how"/);
  expect(html).toMatch(/id="how"/);
});
