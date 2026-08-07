'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');
const dmgUrl =
  'https://github.com/SlavaKlkv/photo_metadata_ai/releases/download/v1.1.0/Photo-Metadata-AI-1.1.0-universal.dmg';

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

// Все CTA скачивания обязаны указывать на один и тот же релиз: иначе
// шапка, hero и финальный блок разъедутся по версиям.
test('кнопки скачивания DMG сходятся на один релиз 1.1.0-universal', () => {
  const html = readLanding();
  const dmgHrefs = [...html.matchAll(/href="(https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/[^"]+\.dmg)"/g)].map(
    (m) => m[1],
  );

  expect(dmgHrefs.length).toBeGreaterThanOrEqual(3);
  expect([...new Set(dmgHrefs)]).toEqual([dmgUrl]);
});

test('финальный CTA предлагает скачать DMG и открыть репозиторий', () => {
  const html = readLanding();
  const final = html.match(/<!-- FINAL CTA -->([\s\S]*?)<\/main>/);

  expect(final).not.toBeNull();
  expect(final[1]).toContain('id="final-cta"');
  expect(final[1]).toContain(dmgUrl);
  expect(final[1]).toContain('href="https://github.com/SlavaKlkv/photo_metadata_ai"');
  expect(final[1]).toMatch(/target="_blank"/);
  expect(final[1]).toMatch(/rel="noopener"/);
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
});
