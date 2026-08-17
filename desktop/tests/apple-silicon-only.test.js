'use strict';

const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const buildScript = fs.readFileSync(path.join(desktopDir, 'scripts/build-mac.sh'), 'utf8');
const builderConfig = fs.readFileSync(path.join(desktopDir, 'electron-builder.yml'), 'utf8');
const packageJson = require('../package.json');

// Приложение собирается только под Apple Silicon: macOS 26 Tahoe —
// последняя версия macOS для Intel-маков, а x86_64-раннеры GitHub
// Actions доступны лишь до 2027 года. Universal2 удваивал вес бэкенда
// в бандле ради уходящей платформы.
describe('electron-builder.yml', () => {
  it('собирает dmg и zip только под arm64', () => {
    const targets = [...builderConfig.matchAll(/arch: \[(.+?)\]/g)].map((m) => m[1]);

    expect(targets).toEqual(['arm64', 'arm64']);
  });

  it('не тянет за собой universal-склейку', () => {
    expect(builderConfig).not.toMatch(/x64ArchFiles/);
    expect(builderConfig).not.toMatch(/arch: \[universal\]/);
  });

  it('сохраняет ad-hoc подпись и выключенный hardened runtime', () => {
    expect(builderConfig).toMatch(/identity: '-'/);
    expect(builderConfig).toMatch(/hardenedRuntime: false/);
  });

  // На раннерах GitHub Python приезжает framework-сборкой, и electron-builder
  // спотыкается на вложенном Python.framework внутри onedir-бандла:
  // "bundle format is ambiguous". На машине разработчика Python обычный,
  // поэтому локально сборка проходила, а в CI падала.
  it('не подписывает бэкенд отдельно', () => {
    expect(builderConfig).toMatch(/signIgnore:\n\s+- Contents\/Resources\/backend\//);
  });
});

describe('build-mac.sh', () => {
  it('не собирает x86_64 и не требует Rosetta', () => {
    expect(buildScript).not.toMatch(/build_backend_rosetta_x86_64/);
    expect(buildScript).not.toMatch(/install-rosetta/);
    expect(buildScript).not.toMatch(/\.venv-x86_64/);
    expect(buildScript).not.toMatch(/dist-x86_64/);
  });

  it('принимает --backend-only только для arm64', () => {
    expect(buildScript).toMatch(/\[\[ "\$BACKEND_ONLY" != "arm64" \]\]/);
    expect(buildScript).toMatch(/--backend-only ожидает arm64, получено/);
  });

  // Раскладка по подкаталогу с архитектурой сохранена: по этому пути
  // бинарник ищет src/backend-process.js.
  it('проверяет наличие единственного бинарника перед упаковкой', () => {
    expect(buildScript).toMatch(/resources\/backend\/arm64\/photo-metadata-backend/);
    expect(buildScript).not.toMatch(/for arch in arm64 x86_64/);
  });

  // resources/backend/ лежит в .gitignore, поэтому срез прежней сборки
  // переживает смену ветки и уехал бы в бандл через extraResources.
  it('выкидывает срезы чужих архитектур перед упаковкой', () => {
    expect(buildScript).toMatch(/удаляю срез прежней сборки/);
    expect(buildScript).toMatch(/!= "arm64"/);
  });
});

describe('версия', () => {
  it('остаётся в линейке 1.2 после отказа от Intel', () => {
    expect(packageJson.version).toMatch(/^1\.2\.\d+$/);
  });

  it('совпадает в package.json и package-lock.json', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.join(desktopDir, 'package-lock.json'), 'utf8'),
    );

    expect(lock.version).toBe(packageJson.version);
    expect(lock.packages[''].version).toBe(packageJson.version);
  });
});

// Onefile распаковывал ~26 МБ Python и библиотек во временный каталог при
// КАЖДОМ запуске: до готовности бэкенда проходило ~7,5 секунды. В режиме
// onedir файлы лежат распакованными в бандле, и старт занимает ~0,35 с.
describe('режим сборки бэкенда', () => {
  const spec = fs.readFileSync(
    path.resolve(__dirname, '../../backend/desktop_build/photo_metadata_backend.spec'),
    'utf8',
  );

  it('собирается в onedir, а не в onefile', () => {
    expect(spec).toMatch(/exclude_binaries=True/);
    expect(spec).toMatch(/coll = COLLECT\(/);
  });

  it('не кладёт бинарники и данные внутрь исполняемого файла', () => {
    const exeBlock = spec.match(/exe = EXE\([\s\S]*?\n\)/)[0];

    expect(exeBlock).not.toMatch(/a\.binaries/);
    expect(exeBlock).not.toMatch(/a\.datas/);
  });

  // Без _internal бэкенд не работает, а сборка выглядит успешной: в
  // черновик релиза уже уезжал бандл с одним исполняемым файлом, потому
  // что CI передавал между job'ами файл вместо каталога.
  it('падает, если рядом с бинарником нет _internal', () => {
    expect(buildScript).toMatch(/! -d "\$DESKTOP_DIR\/resources\/backend\/arm64\/_internal"/);
    expect(buildScript).toMatch(/приехал не весь onedir-бандл/);
  });

  // Исполняемый файл обязан остаться по прежнему пути внутри каталога:
  // по нему его ищет backend-process.js и killOrphanedBackends().
  it('раскладывает содержимое каталога, сохраняя путь к бинарнику', () => {
    expect(buildScript).toMatch(/cp -R "\$dist_dir\/photo-metadata-backend\/\." "\$target\/"/);
    expect(buildScript).toMatch(/check_arch "\$dist_dir\/photo-metadata-backend\/photo-metadata-backend"/);
  });
});
