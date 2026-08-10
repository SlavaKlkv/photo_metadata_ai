'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  updateManifest,
  sha512Base64,
  resolveArtifact,
} = require('../scripts/update-latest-mac');

const buildScript = fs.readFileSync(path.resolve(__dirname, '../scripts/build-mac.sh'), 'utf8');

// Неподписанный DMG под карантином Gatekeeper не монтирует вовсе: по
// клику из панели загрузок не происходит ничего. Ad-hoc подпись образа —
// единственное, что возвращает штатный диалог без учётных данных Apple.
describe('сборка подписывает DMG', () => {
  it('подписывает образ ad-hoc и падает, если подпись не легла', () => {
    expect(buildScript).toMatch(/codesign --force --sign - "\$dmg"/);
    expect(buildScript).toMatch(/Signature=adhoc/);
    expect(buildScript).toMatch(/ОШИБКА: ad-hoc подпись не легла/);
  });

  // `codesign -dv | grep -q` под pipefail давал ложное «подпись не легла»
  // на заведомо подписанном образе: код конвейера складывается из обеих
  // команд. Вывод забираем в переменную и печатаем его при сбое.
  it('проверяет подпись без конвейера и показывает вывод codesign при сбое', () => {
    expect(buildScript).toMatch(/signature="\$\(codesign -dv "\$dmg" 2>&1 \|\| true\)"/);
    expect(buildScript).toMatch(/\[\[ "\$signature" != \*"Signature=adhoc"\* \]\]/);
    expect(buildScript).toMatch(/echo "\$signature" >&2/);
    expect(buildScript).not.toMatch(/codesign -dv "\$dmg" 2>&1 \| grep/);
  });

  it('не выпускает сборку, когда DMG не собрался', () => {
    expect(buildScript).toMatch(/не найдено ни одного \.dmg версии \$version/);
  });

  // В out/ рядом лежат артефакты прошлых релизов. Однажды сборка уже
  // упала на чужом 1.0.0, так и не дойдя до собранного образа.
  it('берёт только образы текущей версии, а не всё подряд в out/', () => {
    expect(buildScript).toMatch(/require\('\$DESKTOP_DIR\/package\.json'\)\.version/);
    expect(buildScript).toMatch(/out\/\*-"\$version"-\*\.dmg/);
    expect(buildScript).not.toMatch(/for dmg in "\$DESKTOP_DIR"\/out\/\*\.dmg/);
  });

  it('пересчитывает манифест обновления после подписи', () => {
    const signIndex = buildScript.indexOf('codesign --force --sign -');
    const updateIndex = buildScript.indexOf('update-latest-mac.js');

    expect(updateIndex).toBeGreaterThan(signIndex);
  });
});

// codesign дописывает подпись внутрь образа, меняя его размер и sha512.
// Автообновление сверяет их побайтно, поэтому манифест обязан догонять.
describe('updateManifest', () => {
  let outDir;

  function writeArtifact(name, content) {
    fs.writeFileSync(path.join(outDir, name), content);
  }

  function manifest({ dmgSha = 'stale-dmg', dmgSize = 1, zipSha = 'stale-zip', zipSize = 1 } = {}) {
    return [
      'version: 1.1.0',
      'files:',
      '  - url: app-1.1.0-universal-mac.zip',
      `    sha512: ${zipSha}`,
      `    size: ${zipSize}`,
      '  - url: app-1.1.0-universal.dmg',
      `    sha512: ${dmgSha}`,
      `    size: ${dmgSize}`,
      'path: app-1.1.0-universal-mac.zip',
      `sha512: ${zipSha}`,
      "releaseDate: '2026-08-10T11:41:11.101Z'",
      '',
    ].join('\n');
  }

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latest-mac-'));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('подставляет реальные sha512 и size для существующих артефактов', () => {
    writeArtifact('app-1.1.0-universal.dmg', 'подписанный образ');
    writeArtifact('app-1.1.0-universal-mac.zip', 'архив');

    const { text, updated } = updateManifest(manifest(), outDir);

    expect(updated).toEqual(['app-1.1.0-universal-mac.zip', 'app-1.1.0-universal.dmg']);
    expect(text).toContain(`sha512: ${sha512Base64(path.join(outDir, 'app-1.1.0-universal.dmg'))}`);
    expect(text).toContain(`size: ${Buffer.byteLength('подписанный образ')}`);
    expect(text).toContain(`size: ${Buffer.byteLength('архив')}`);
  });

  it('обновляет корневую sha512, дублирующую основной артефакт обновления', () => {
    writeArtifact('app-1.1.0-universal-mac.zip', 'архив');
    const zipSha = sha512Base64(path.join(outDir, 'app-1.1.0-universal-mac.zip'));

    const { text } = updateManifest(manifest(), outDir);
    const rootSha = text.match(/^sha512: (.+)$/m)[1];

    expect(rootSha).toBe(zipSha);
  });

  it('сообщает о записях, для которых артефакт не найден', () => {
    writeArtifact('app-1.1.0-universal-mac.zip', 'архив');

    const { text, updated, missing } = updateManifest(manifest({ dmgSha: 'stale-dmg' }), outDir);

    expect(updated).not.toContain('app-1.1.0-universal.dmg');
    expect(missing).toEqual(['app-1.1.0-universal.dmg']);
    expect(text).toContain('sha512: stale-dmg');
  });

  // Имена в манифесте url-safe, а на диске — с пробелами. Из-за этого
  // суммы молча оставались от неподписанного образа: запись есть, файл
  // «не найден», пересчёт не происходит.
  it('находит артефакт, когда в манифесте пробелы заменены дефисами', () => {
    writeArtifact('Photo Metadata AI-1.1.0-universal.dmg', 'подписанный образ');
    const onDisk = path.join(outDir, 'Photo Metadata AI-1.1.0-universal.dmg');

    const text = [
      'version: 1.1.0',
      'files:',
      '  - url: Photo-Metadata-AI-1.1.0-universal.dmg',
      '    sha512: stale',
      '    size: 1',
      'path: Photo-Metadata-AI-1.1.0-universal.dmg',
      'sha512: stale',
      '',
    ].join('\n');

    const result = updateManifest(text, outDir);

    expect(result.missing).toEqual([]);
    expect(result.updated).toEqual(['Photo-Metadata-AI-1.1.0-universal.dmg']);
    expect(result.text).toContain(`sha512: ${sha512Base64(onDisk)}`);
    expect(result.text).toContain(`size: ${fs.statSync(onDisk).size}`);
    expect(result.text).not.toContain('stale');
  });

  it('сопоставляет имена и напрямую, и через замену пробелов', () => {
    writeArtifact('Photo Metadata AI-1.1.0-universal.dmg', 'образ');
    writeArtifact('plain-name.zip', 'архив');

    expect(resolveArtifact(outDir, 'Photo-Metadata-AI-1.1.0-universal.dmg')).toBe(
      path.join(outDir, 'Photo Metadata AI-1.1.0-universal.dmg'),
    );
    expect(resolveArtifact(outDir, 'plain-name.zip')).toBe(path.join(outDir, 'plain-name.zip'));
    expect(resolveArtifact(outDir, 'нет-такого.dmg')).toBeNull();
  });

  it('ничего не пишет, когда суммы уже совпадают', () => {
    writeArtifact('app-1.1.0-universal.dmg', 'подписанный образ');
    writeArtifact('app-1.1.0-universal-mac.zip', 'архив');

    const first = updateManifest(manifest(), outDir);
    const second = updateManifest(first.text, outDir);

    expect(second.updated).toEqual([]);
    expect(second.text).toBe(first.text);
  });

  it('падает внятно, если формат манифеста изменился', () => {
    expect(() => updateManifest('version: 1.1.0\nfiles: []\n', outDir)).toThrow(/формат манифеста/);
  });

  it('считает sha512 в base64, как ожидает electron-updater', () => {
    writeArtifact('app-1.1.0-universal.dmg', 'подписанный образ');
    const filePath = path.join(outDir, 'app-1.1.0-universal.dmg');
    const expected = crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');

    expect(sha512Base64(filePath)).toBe(expected);
  });
});
