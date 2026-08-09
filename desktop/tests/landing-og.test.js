'use strict';

const fs = require('fs');
const path = require('path');

const { buildOgHtml, extractDiv, readPngSize } = require('../scripts/build-og');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const landingPath = path.join(landingDir, 'index.html');
const readIndex = () => fs.readFileSync(landingPath, 'utf8');

test('OG собирается из живого мокапа главной, а не из его копии', () => {
  const html = readIndex();
  const heroVisual = extractDiv(html, '<div class="hero-visual">');
  const og = buildOgHtml(html);

  // Разметка окна попадает в OG целиком: расхождению взяться неоткуда.
  expect(og).toContain(extractDiv(heroVisual, '<div class="mock-steps">'));
  expect(og).toContain(extractDiv(heroVisual, '<div class="mock-chips">'));
  expect(
    [...og.matchAll(/<div class="mock-row(?: on)?">/g)],
  ).toHaveLength([...heroVisual.matchAll(/<div class="mock-row(?: on)?">/g)].length);
});

test('OG использует стили страницы и не тянет внешние ресурсы', () => {
  const html = readIndex();
  const og = buildOgHtml(html);
  const landingCss = html.match(/<style>([\s\S]*?)<\/style>/)[1];

  expect(og).toContain(landingCss);
  expect(og).not.toMatch(/(?:src|href)="https?:/);
  // Картинка рендерится из временного каталога: относительные пути не найдутся.
  expect(og).not.toMatch(/src="logo\.svg"/);
  // Слева и в мокапе — UI-метка без плитки, не favicon icon.svg.
  expect(og).toContain(`src="file://${landingDir}/logo.svg"`);
  expect(og).not.toMatch(/src="file:\/\/[^"]*icon\.svg"/);
  expect([...og.matchAll(/src="file:\/\/[^"]*logo\.svg"/g)]).toHaveLength(2);
});

test('фактический og.png совпадает с размерами, объявленными в разметке', () => {
  const html = readIndex();
  const { width, height } = readPngSize(path.join(landingDir, 'og.png'));

  expect(html).toContain(`<meta property="og:image:width" content="${width}">`);
  expect(html).toContain(`<meta property="og:image:height" content="${height}">`);
});

test('pre-commit пересобирает OG только при правке главной и не рушит коммит без Chrome', () => {
  const hook = fs.readFileSync(
    path.resolve(__dirname, '../scripts/hooks/pre-commit'),
    'utf8',
  );

  expect(hook).toContain('landing-og-hook');
  expect(hook).toMatch(/git diff --cached --name-only/);
  expect(hook).toMatch(/docs\/landing\/index\\?\.html/);
  expect(hook).toContain('desktop/scripts/build-og.js');
  expect(hook).toMatch(/"\$status" -eq 2[\s\S]*exit 0/);
  expect(hook).toContain('git add "$repo_root/docs/landing/og.png"');
});

test('сборка OG и установка хуков доступны как npm-скрипты', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
  );

  expect(pkg.scripts['build:og']).toBe('node scripts/build-og.js');
  expect(pkg.scripts['hooks:install']).toBe('node scripts/install-hooks.js');
});
