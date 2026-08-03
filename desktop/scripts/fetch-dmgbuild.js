#!/usr/bin/env node
// Заранее кладёт в кэш electron-builder бинарник dmgbuild и печатает
// путь к нему.
//
// Зачем: scripts/dmgbuild-wrapper.sh подменяет собой dmgbuild (через
// CUSTOM_DMGBUILD_PATH) и вызывает настоящий по пути REAL_DMGBUILD.
// Настоящий появляется только после того, как electron-builder сам его
// скачает, — то есть на чистом раннере CI его нет, и первая же сборка
// (она же релизная) уезжала с дефолтным фоном DMG и без стрелки.
//
// Скачиваем тем же кодом, что и electron-builder (downloadBuilderToolset
// проверяет контрольную сумму и кладёт файл в тот же кэш). Версию
// бандла и суммы не хардкодим — вычитываем из исходника dmg-builder,
// поэтому при обновлении зависимости они не разъедутся.

const fs = require('fs');
const path = require('path');

const DMG_UTIL = require.resolve('dmg-builder/out/dmgUtil');

function readVendorSpec() {
  const source = fs.readFileSync(DMG_UTIL, 'utf8');

  const releaseName = source.match(/releaseName:\s*"([^"]+)"/);
  const filename = source.match(/filenameWithExt:\s*`([^`]+)`/);
  if (!releaseName || !filename) {
    throw new Error(
      `Не удалось разобрать параметры dmgbuild в ${DMG_UTIL}. ` +
        'Похоже, изменилась структура dmg-builder — обновите этот скрипт.'
    );
  }

  // В исходнике имя собрано шаблоном по process.arch — подставляем то же.
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const filenameWithExt = filename[1].replace('${arch}', arch);

  const checksums = {};
  const checksumRe = /"(dmgbuild-bundle-[^"]+)":\s*"([0-9a-f]+)"/g;
  let match;
  while ((match = checksumRe.exec(source)) !== null) {
    checksums[match[1]] = match[2];
  }
  if (!checksums[filenameWithExt]) {
    throw new Error(
      `В ${DMG_UTIL} нет контрольной суммы для ${filenameWithExt}.`
    );
  }

  return { releaseName: releaseName[1], filenameWithExt, checksums };
}

async function fetchDmgbuild() {
  const { downloadBuilderToolset } = require(
    'app-builder-lib/out/util/electronGet'
  );

  const dir = await downloadBuilderToolset(readVendorSpec());
  const binary = path.resolve(dir, 'dmgbuild');

  if (!fs.existsSync(binary)) {
    throw new Error(`dmgbuild не найден после распаковки: ${binary}`);
  }

  return binary;
}

module.exports = { readVendorSpec, fetchDmgbuild };

if (require.main === module) {
  fetchDmgbuild()
    .then((binary) => process.stdout.write(binary + '\n'))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
