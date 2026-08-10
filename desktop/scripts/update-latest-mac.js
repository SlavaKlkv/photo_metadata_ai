'use strict';

// Пересчёт контрольных сумм в latest-mac.yml.
//
// electron-builder генерирует этот файл сразу после упаковки, а DMG мы
// подписываем ad-hoc уже после него: codesign дописывает подпись внутрь
// образа, поэтому размер и sha512 в манифесте перестают совпадать с
// артефактом. Автообновление сверяет их побайтно и отвергло бы скачанный
// файл, так что манифест надо привести в соответствие.
//
// Формат latest-mac.yml правится текстом, а не через YAML-библиотеку:
// лишней зависимости в сборке не хочется, а структура файла у
// electron-builder плоская и стабильная.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha512Base64(filePath) {
  return crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');
}

// В манифесте имена url-safe: electron-builder заменяет пробелы дефисами,
// поэтому «Photo-Metadata-AI-1.1.0-universal.dmg» в файле соответствует
// «Photo Metadata AI-1.1.0-universal.dmg» на диске. Сопоставляем по тому
// же правилу, иначе артефакт не находится и суммы молча остаются старыми.
function resolveArtifact(outDir, urlName) {
  const direct = path.join(outDir, urlName);
  if (fs.existsSync(direct)) return direct;

  const match = fs
    .readdirSync(outDir)
    .find((name) => name.replace(/ /g, '-') === urlName);

  return match ? path.join(outDir, match) : null;
}

// Возвращает обновлённый текст манифеста и список тронутых файлов.
// Файлы, которых нет на диске, пропускаются молча: манифест может
// перечислять артефакты других архитектур, собранных отдельным прогоном.
function updateManifest(manifestText, outDir) {
  const updated = [];
  const missing = [];

  // Записи в files: идут блоками "- url: <имя>" со своими sha512 и size.
  const text = manifestText.replace(
    /( {2}- url: (.+)\n {4}sha512: )(.+)(\n {4}size: )(\d+)/g,
    (match, headUrl, fileName, oldSha, headSize, oldSize) => {
      const filePath = resolveArtifact(outDir, fileName);
      if (!filePath) {
        missing.push(fileName);
        return match;
      }

      const sha512 = sha512Base64(filePath);
      const size = fs.statSync(filePath).size;
      if (sha512 === oldSha && String(size) === oldSize) return match;

      updated.push(fileName);
      return `${headUrl}${sha512}${headSize}${size}`;
    },
  );

  // Корневые path/sha512 дублируют запись основного артефакта обновления
  // (zip). Если его сумма поменялась, здесь она должна поменяться тоже.
  const pathMatch = text.match(/^path: (.+)$/m);
  if (!pathMatch) {
    throw new Error('latest-mac.yml без поля path: формат манифеста изменился');
  }

  const mainFile = resolveArtifact(outDir, pathMatch[1]);
  if (!mainFile) return { text, updated, missing };

  return {
    text: text.replace(/^sha512: .+$/m, `sha512: ${sha512Base64(mainFile)}`),
    updated,
    missing,
  };
}

function main() {
  const outDir = process.argv[2] || path.resolve(__dirname, '../out');
  const manifestPath = path.join(outDir, 'latest-mac.yml');

  if (!fs.existsSync(manifestPath)) {
    console.error(`ОШИБКА: не найден ${manifestPath}`);
    process.exit(1);
  }

  const { text, updated, missing } = updateManifest(
    fs.readFileSync(manifestPath, 'utf8'),
    outDir,
  );

  // Ненайденный артефакт — это рассинхрон манифеста со сборкой, и он
  // опаснее всего молча: суммы остаются от неподписанного образа, а
  // автообновление отвергает скачанный файл уже у пользователя.
  if (missing.length > 0) {
    console.error(`ОШИБКА: артефакты из latest-mac.yml не найдены: ${missing.join(', ')}`);
    process.exit(1);
  }

  fs.writeFileSync(manifestPath, text);

  if (updated.length === 0) {
    console.log('latest-mac.yml: суммы уже совпадают с артефактами');
  } else {
    console.log(`latest-mac.yml: пересчитаны суммы для ${updated.join(', ')}`);
  }
}

if (require.main === module) main();

module.exports = { updateManifest, sha512Base64, resolveArtifact };
