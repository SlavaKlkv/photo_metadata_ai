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

// electron-builder публикует результат упаковки, то есть неподписанный
// образ. Именно так в релиз v1.1.0 уехал DMG, который не открывался из
// браузера. Публикацию делаем сами — строго после подписи.
describe('публикация артефактов', () => {
  it('не даёт electron-builder публиковать самому', () => {
    expect(buildScript).toMatch(/npx electron-builder --mac --publish never/);
  });

  it('перехватывает --publish, а не пробрасывает его сборщику', () => {
    expect(buildScript).toMatch(/--publish=\*\)/);
    expect(buildScript).toMatch(/PUBLISH="\$\{arg#--publish=\}"/);
  });

  it('грузит артефакты после подписи и пересчёта манифеста', () => {
    const signIndex = buildScript.indexOf('sign_dmg\n  publish_artifacts');

    expect(signIndex).toBeGreaterThan(-1);
    expect(buildScript.indexOf('gh release upload')).toBeGreaterThan(
      buildScript.indexOf('update-latest-mac.js'),
    );
  });

  it('молчит без --publish и при --publish never', () => {
    expect(buildScript).toMatch(/\[\[ -n "\$PUBLISH" && "\$PUBLISH" != "never" \]\] \|\| return 0/);
  });

  // Лендинг и latest-mac.yml ссылаются на дефисный вариант имени,
  // а на диске файлы с пробелами — без переименования ссылки бьются в 404.
  it('приводит имена артефактов к url-safe виду', () => {
    expect(buildScript).toMatch(/tr ' ' '-'/);
  });

  it('создаёт релиз черновиком, чтобы обновление не увидело его сразу', () => {
    expect(buildScript).toMatch(/gh release create "\$tag" --draft/);
  });
});

// На чистом раннере кэша electron-builder нет: find возвращает 1,
// pipefail пробрасывает код через head, и под set -e сборка падала на
// присваивании — молча, без единого сообщения. Пустой кэш это норма.
describe('поиск dmgbuild в кэше', () => {
  it('переживает отсутствие кэша, а не роняет сборку', () => {
    const fn = buildScript.match(/find_cached_dmgbuild\(\) \{[\s\S]*?\n\}/)[0];

    expect(fn).toMatch(/\|\| true/);
  });

  // Свежераспакованный бандл приезжает без бита исполняемости: у
  // разработчика он выставлен прошлыми распаковками, на чистом раннере —
  // нет, и сборка падала уже после успешного скачивания.
  it('сам проставляет бит исполняемости скачанному бандлу', () => {
    const fn = buildScript.match(/ensure_dmgbuild\(\) \{[\s\S]*?\n\}/)[0];

    expect(fn).toMatch(/chmod \+x "\$REAL_DMGBUILD"/);
    expect(fn).toMatch(/не удалось сделать .* исполняемым/);
  });
});

// Workflow не должен возвращаться к публикации силами electron-builder.
describe('release.yml', () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, '../../.github/workflows/release.yml'),
    'utf8',
  );

  it('собирает и публикует через build-mac.sh', () => {
    expect(workflow).toMatch(/build-mac\.sh --app-only --publish always/);
  });

  // Тег занят после первой попытки, а перезапустить сборку нечем:
  // единственный триггер по push тега загонял в тупик, когда job падал
  // по внешней причине.
  describe('ручной запуск', () => {
    it('доступен с вкладки Actions', () => {
      expect(workflow).toMatch(/workflow_dispatch:/);
    });

    it('по умолчанию ничего не публикует', () => {
      const input = workflow.match(/publish:[\s\S]*?default: (\w+)/);

      expect(input[1]).toBe('false');
    });

    it('не сверяет версию с тегом, когда тега нет', () => {
      expect(workflow).toMatch(/if: github\.ref_type == 'tag'/);
    });

    it('публикует по тегу всегда, вручную — только по запросу', () => {
      expect(workflow).toMatch(/github\.ref_type }}" == "tag" \|\| "\$\{\{ inputs\.publish }}" == "true"/);
    });
  });

  // Intel-срез убран вместе с поддержкой архитектуры. Матрица раннеров
  // не должна вернуться: x86_64-образы GitHub Actions живут до 2027 года.
  it('собирает бэкенд нативно на Apple Silicon, без Intel-джоба', () => {
    // Проверяются исполняемые директивы, а не комментарии: причину
    // отказа от Intel в них объяснять как раз нужно.
    const directives = workflow
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    expect(directives).toMatch(/runs-on: macos-14 # Apple Silicon/);
    expect(directives).not.toMatch(/macos-13/);
    expect(directives).not.toMatch(/x86_64/);
    expect(directives).not.toMatch(/matrix\./);
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
      'version: 1.2.0',
      'files:',
      '  - url: app-1.2.0-arm64-mac.zip',
      `    sha512: ${zipSha}`,
      `    size: ${zipSize}`,
      '  - url: app-1.2.0-arm64.dmg',
      `    sha512: ${dmgSha}`,
      `    size: ${dmgSize}`,
      'path: app-1.2.0-arm64-mac.zip',
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
    writeArtifact('app-1.2.0-arm64.dmg', 'подписанный образ');
    writeArtifact('app-1.2.0-arm64-mac.zip', 'архив');

    const { text, updated } = updateManifest(manifest(), outDir);

    expect(updated).toEqual(['app-1.2.0-arm64-mac.zip', 'app-1.2.0-arm64.dmg']);
    expect(text).toContain(`sha512: ${sha512Base64(path.join(outDir, 'app-1.2.0-arm64.dmg'))}`);
    expect(text).toContain(`size: ${Buffer.byteLength('подписанный образ')}`);
    expect(text).toContain(`size: ${Buffer.byteLength('архив')}`);
  });

  it('обновляет корневую sha512, дублирующую основной артефакт обновления', () => {
    writeArtifact('app-1.2.0-arm64-mac.zip', 'архив');
    const zipSha = sha512Base64(path.join(outDir, 'app-1.2.0-arm64-mac.zip'));

    const { text } = updateManifest(manifest(), outDir);
    const rootSha = text.match(/^sha512: (.+)$/m)[1];

    expect(rootSha).toBe(zipSha);
  });

  it('сообщает о записях, для которых артефакт не найден', () => {
    writeArtifact('app-1.2.0-arm64-mac.zip', 'архив');

    const { text, updated, missing } = updateManifest(manifest({ dmgSha: 'stale-dmg' }), outDir);

    expect(updated).not.toContain('app-1.2.0-arm64.dmg');
    expect(missing).toEqual(['app-1.2.0-arm64.dmg']);
    expect(text).toContain('sha512: stale-dmg');
  });

  // Имена в манифесте url-safe, а на диске — с пробелами. Из-за этого
  // суммы молча оставались от неподписанного образа: запись есть, файл
  // «не найден», пересчёт не происходит.
  it('находит артефакт, когда в манифесте пробелы заменены дефисами', () => {
    writeArtifact('Photo Metadata AI-1.2.0-arm64.dmg', 'подписанный образ');
    const onDisk = path.join(outDir, 'Photo Metadata AI-1.2.0-arm64.dmg');

    const text = [
      'version: 1.2.0',
      'files:',
      '  - url: Photo-Metadata-AI-1.2.0-arm64.dmg',
      '    sha512: stale',
      '    size: 1',
      'path: Photo-Metadata-AI-1.2.0-arm64.dmg',
      'sha512: stale',
      '',
    ].join('\n');

    const result = updateManifest(text, outDir);

    expect(result.missing).toEqual([]);
    expect(result.updated).toEqual(['Photo-Metadata-AI-1.2.0-arm64.dmg']);
    expect(result.text).toContain(`sha512: ${sha512Base64(onDisk)}`);
    expect(result.text).toContain(`size: ${fs.statSync(onDisk).size}`);
    expect(result.text).not.toContain('stale');
  });

  it('сопоставляет имена и напрямую, и через замену пробелов', () => {
    writeArtifact('Photo Metadata AI-1.2.0-arm64.dmg', 'образ');
    writeArtifact('plain-name.zip', 'архив');

    expect(resolveArtifact(outDir, 'Photo-Metadata-AI-1.2.0-arm64.dmg')).toBe(
      path.join(outDir, 'Photo Metadata AI-1.2.0-arm64.dmg'),
    );
    expect(resolveArtifact(outDir, 'plain-name.zip')).toBe(path.join(outDir, 'plain-name.zip'));
    expect(resolveArtifact(outDir, 'нет-такого.dmg')).toBeNull();
  });

  it('ничего не пишет, когда суммы уже совпадают', () => {
    writeArtifact('app-1.2.0-arm64.dmg', 'подписанный образ');
    writeArtifact('app-1.2.0-arm64-mac.zip', 'архив');

    const first = updateManifest(manifest(), outDir);
    const second = updateManifest(first.text, outDir);

    expect(second.updated).toEqual([]);
    expect(second.text).toBe(first.text);
  });

  it('падает внятно, если формат манифеста изменился', () => {
    expect(() => updateManifest('version: 1.1.0\nfiles: []\n', outDir)).toThrow(/формат манифеста/);
  });

  it('считает sha512 в base64, как ожидает electron-updater', () => {
    writeArtifact('app-1.2.0-arm64.dmg', 'подписанный образ');
    const filePath = path.join(outDir, 'app-1.2.0-arm64.dmg');
    const expected = crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');

    expect(sha512Base64(filePath)).toBe(expected);
  });
});
