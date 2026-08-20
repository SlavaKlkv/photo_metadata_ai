'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

// Версия не зашивается: релизный workflow переписывает её в ссылках сам
// (desktop/scripts/update-landing-release.js), и тест с константой падал
// бы на каждом выпуске. Проверяется то, что важно, — ссылки согласованы
// между собой и ведут на arm64-образ ожидаемого вида.
const dmgUrl = (() => {
  const match = fs
    .readFileSync(landingPath, 'utf8')
    .match(
      /https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/v(\d+\.\d+\.\d+)\/Photo-Metadata-AI-\1-arm64\.dmg/,
    );

  if (!match) throw new Error('в лендинге нет ссылки на arm64-образ релиза');
  return match[0];
})();

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

// Все CTA скачивания на обеих страницах обязаны указывать на один релиз:
// иначе главная и галерея расходятся по версиям.
test('кнопки скачивания на всех страницах сходятся на один релиз arm64', () => {
  const screensPath = path.resolve(__dirname, '../../docs/landing/screens.html');
  const pages = [readLanding(), fs.readFileSync(screensPath, 'utf8')];
  const dmgHrefs = pages.flatMap((html) =>
    [...html.matchAll(/href="(https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/[^"]+\.dmg)"/g)].map(
      (m) => m[1],
    ),
  );

  expect(dmgHrefs).toHaveLength(4);
  expect([...new Set(dmgHrefs)]).toEqual([dmgUrl]);
});

test('кнопки .dmg: текст «Скачать»; Apple нет; в финале — иконка загрузки', () => {
  const screensPath = path.resolve(__dirname, '../../docs/landing/screens.html');
  const indexHtml = readLanding();
  const screensHtml = fs.readFileSync(screensPath, 'utf8');

  expect(indexHtml).not.toMatch(/svg\.apple|class="apple"/);
  expect(screensHtml).not.toMatch(/svg\.apple|class="apple"/);

  const dmgInners = (html) =>
    [...html.matchAll(
      /<a\b[^>]*href="https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/[^"]+\.dmg"[^>]*>([\s\S]*?)<\/a>/g,
    )].map((m) => m[1]);

  const indexDmgs = dmgInners(indexHtml);
  expect(indexDmgs).toHaveLength(3);

  // Шапка и герой — только текст.
  expect(indexDmgs[0].trim()).toBe('Скачать');
  expect(indexDmgs[1].trim()).toBe('Скачать');

  // Финальный CTA — стрелка загрузки + «Скачать».
  expect(indexDmgs[2]).toMatch(/<svg viewBox="0 0 24 24"/);
  expect(indexDmgs[2]).toMatch(/Скачать/);
  expect(indexDmgs[2]).not.toMatch(/apple/i);

  expect(dmgInners(screensHtml)[0].trim()).toBe('Скачать');
});

test('финальный CTA не дублирует ссылку на исходный код из футера', () => {
  const html = readLanding();
  const final = html.match(/<!-- FINAL CTA -->([\s\S]*?)<\/main>/);

  expect(final).not.toBeNull();
  expect(final[1]).toContain('id="final-cta"');
  expect(final[1]).toContain(dmgUrl);
  expect(final[1]).not.toContain('href="https://github.com/SlavaKlkv/photo_metadata_ai"');
  expect(final[1]).not.toMatch(/Смотреть на GitHub/);
});

test('строка площадок называет Adobe Stock, Shutterstock и Getty Images', () => {
  const html = readLanding();
  const platforms = html.match(/<!-- ПЛОЩАДКИ -->([\s\S]*?)<!-- FEATURES -->/);

  expect(platforms).not.toBeNull();
  expect(platforms[1]).toContain('Adobe Stock');
  expect(platforms[1]).toContain('Shutterstock');
  expect(platforms[1]).toContain('Getty Images');
  expect(platforms[1].match(/<b>/g)).toHaveLength(3);
});

test('блок скриншотов ведёт на галерею из 15 экранов и якоря конкретных снимков', () => {
  const html = readLanding();
  const screens = html.match(/<!-- SCREENS -->([\s\S]*?)<!-- PRIVACY -->/);

  expect(screens).not.toBeNull();
  expect(screens[1]).toContain('href="screens.html"');
  expect(screens[1]).toContain('все 15 экранов');
  expect(screens[1]).toContain('screens.html#shot-07_review_metadata_preview');
  expect(screens[1]).toContain('screens.html#shot-05_upload_and_context');
  expect(screens[1]).toContain('screens.html#shot-06_processing');
  expect(screens[1]).toContain('screens.html#shot-13_export_completed');
  expect(screens[1]).toContain('screens.html#shot-15_exported_file_iptc_metadata');
  // Галерея с главной — в новой вкладке.
  const screenAnchors = [...screens[1].matchAll(/<a\b[^>]*href="screens\.html[^"]*"[^>]*>/g)].map(
    (m) => m[0]
  );
  expect(screenAnchors.length).toBeGreaterThanOrEqual(5);
  for (const tag of screenAnchors) {
    expect(tag).toMatch(/target="_blank"/);
  }
});
