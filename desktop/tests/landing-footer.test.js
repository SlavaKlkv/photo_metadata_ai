'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function footerHtml(html) {
  const match = html.match(/<footer>([\s\S]*?)<\/footer>/);
  expect(match).not.toBeNull();
  return match[1];
}

// Галерея остаётся быстрым продолжением просмотра, но визуально и
// семантически отделена от юридических документов.
test('футер отделяет галерею от Условий и Исходного кода', () => {
  const foot = footerHtml(readLanding());

  expect(foot).toContain('© 2026 Photo Metadata AI · All rights reserved');
  expect(foot).toContain('class="foot-gallery"');
  expect(foot).toContain('href="screens.html"');
  expect(foot).toMatch(/Все экраны/);
  const terms = foot.match(/<a\b[^>]*href="terms\.html"[^>]*>/);
  expect(terms).not.toBeNull();
  expect(terms[0]).toMatch(/target="_blank"/);
  expect(terms[0]).toMatch(/rel="noopener"/);
  expect(foot).toMatch(/Условия/);
  expect(foot).toContain(
    'href="https://github.com/SlavaKlkv/photo_metadata_ai"',
  );
  expect(foot).toMatch(/Исходный код/);
  expect(foot).toContain('class="foot-docs"');
  expect(foot).toMatch(/class="foot-gallery"[\s\S]*class="foot-docs"/);
});
