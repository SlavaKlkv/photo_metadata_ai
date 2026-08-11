'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyReleaseInfo,
  appSizeBytes,
  formatMb,
} = require('../scripts/update-landing-release.js');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

// Регрессия: на лендинге стояло «DMG ~120 МБ», тогда как релизный образ
// весил 135 МБ, а установленное приложение — 318,7 МБ. Пользователь
// скачивал одно число, а в Finder видел другое, втрое больше.
test('строка под кнопкой называет объём загрузки и место после установки', () => {
  const note = readLanding().match(/<p class="cta-note">([\s\S]*?)<\/p>/);

  expect(note).not.toBeNull();
  expect(note[1]).toMatch(/^Загрузка \d+ МБ · после установки \d+ МБ<br>без регистрации/);
  expect(note[1]).not.toContain('~');
});

test('подстановка переписывает все ссылки на DMG под новую версию', () => {
  const updated = applyReleaseInfo(readLanding(), {
    version: '9.9.9',
    dmgBytes: 140_000_000,
    appBytes: 330_000_000,
  });

  const hrefs = [
    ...updated.matchAll(
      /https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/[^"]+\.dmg/g,
    ),
  ].map((m) => m[0]);

  expect(hrefs.length).toBeGreaterThanOrEqual(3);
  expect([...new Set(hrefs)]).toEqual([
    'https://github.com/SlavaKlkv/photo_metadata_ai/releases/download/v9.9.9/Photo-Metadata-AI-9.9.9-arm64.dmg',
  ]);
});

test('подстановка обновляет оба размера, не трогая остальной текст', () => {
  const updated = applyReleaseInfo(readLanding(), {
    version: '9.9.9',
    dmgBytes: 140_000_000,
    appBytes: 330_000_000,
  });

  expect(updated).toContain(
    '<p class="cta-note">Загрузка 140 МБ · после установки 330 МБ<br>без регистрации и подписки',
  );
});

// Повторный прогон того же релиза не должен давать коммит: на это
// опирается проверка `git diff --quiet` в релизном workflow.
test('повторная подстановка тех же данных ничего не меняет', () => {
  const args = { version: '9.9.9', dmgBytes: 140_000_000, appBytes: 330_000_000 };
  const once = applyReleaseInfo(readLanding(), args);

  expect(applyReleaseInfo(once, args)).toBe(once);
});

test('подстановка падает, если разметка лендинга разошлась с ожидаемой', () => {
  const args = { version: '9.9.9', dmgBytes: 1e8, appBytes: 3e8 };

  expect(() => applyReleaseInfo('<p>без ссылок и примечания</p>', args)).toThrow(
    /ссылк/,
  );
  expect(() =>
    applyReleaseInfo(
      '<a href="https://github.com/SlavaKlkv/photo_metadata_ai/releases/download/v1.0.0/x.dmg">x</a>',
      args,
    ),
  ).toThrow(/cta-note/);
});

// Finder считает мегабайты по 10^6, а не по 1024: на релизном образе
// 1.2.0 сумма размеров файлов дала 318 671 720 Б и те самые 318,7 МБ.
test('размер округляется до целых мегабайт по основанию 10^6', () => {
  expect(formatMb(318_671_720)).toBe('319');
  expect(formatMb(135_035_026)).toBe('135');
});

test('размер приложения складывается из файлов и не считает симлинки дважды', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-size-'));
  const inner = path.join(root, 'Contents');

  fs.mkdirSync(inner);
  fs.writeFileSync(path.join(inner, 'binary'), Buffer.alloc(1000));
  fs.writeFileSync(path.join(inner, 'resource'), Buffer.alloc(500));
  fs.symlinkSync(path.join(inner, 'binary'), path.join(root, 'Current'));

  expect(appSizeBytes(root)).toBe(1500);

  fs.rmSync(root, { recursive: true, force: true });
});
