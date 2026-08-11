#!/usr/bin/env node
'use strict';

// Подстановка в лендинг фактических данных релиза: версии в ссылках на
// скачивание и двух размеров — DMG и установленного приложения.
//
// Зачем оба числа. Пользователь скачивает образ на 135 МБ, а в Finder
// видит 318,7 МБ и не понимает, откуда разница: в DMG всё сжато. Одно
// число без подписи неизбежно расходится с тем, что человек видит у
// себя, поэтому пишем оба и подписываем каждое.
//
// Почему числа считаются, а не проставляются руками: зашитые вручную,
// они расходятся с реальностью на первом же релизе — так на лендинге и
// оказалось «~120 МБ» при фактических 135.

const fs = require('fs');
const path = require('path');

// Размер приложения считается как сумма логических размеров файлов,
// делённая на 10^6. Это ровно то, что показывает Finder в «Информации»:
// проверено на релизном образе 1.2.0 — 318 671 720 Б даёт те самые
// 318,7 МБ. Занятое на диске (du) дало бы 319,3 МБ, то есть цифру,
// которой пользователь у себя не увидит.
function appSizeBytes(appPath) {
  let total = 0;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      // Симлинки не разыменовываем: во Frameworks они ведут на файлы
      // внутри того же бандла, и обход по ним посчитал бы их дважды.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  };

  walk(appPath);
  return total;
}

function formatMb(bytes) {
  return String(Math.round(bytes / 1e6));
}

// Возвращает изменённый HTML, не трогая файл: так одну и ту же правку
// можно применить к разным веткам, а тесты обходятся без записи.
function applyReleaseInfo(html, { version, dmgBytes, appBytes }) {
  const dmgUrl =
    `https://github.com/SlavaKlkv/photo_metadata_ai/releases/download/v${version}/` +
    `Photo-Metadata-AI-${version}-arm64.dmg`;

  const updated = html
    .replace(
      /https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai\/releases\/download\/v[^"]+\.dmg/g,
      dmgUrl,
    )
    // Размеры живут в начале строки-примечания; остальная её часть (про
    // регистрацию и ключ) правки не касается. Шаблон совпадает целиком, а
    // не «до первого разделителя»: так расхождение с разметкой всплывает
    // проверкой ниже, а не тихой порчей текста.
    .replace(
      /(<p class="cta-note">)Загрузка \d+ МБ · на диске \d+ МБ ·/,
      `$1Загрузка ${formatMb(dmgBytes)} МБ · на диске ${formatMb(appBytes)} МБ ·`,
    );

  if (!updated.includes(dmgUrl)) {
    throw new Error('в лендинге не найдено ни одной ссылки на DMG');
  }

  if (!/<p class="cta-note">Загрузка \d+ МБ · на диске \d+ МБ ·/.test(updated)) {
    throw new Error('в лендинге не найдена строка cta-note с размерами');
  }

  return updated;
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) args.set(argv[i], argv[i + 1]);

  const appPath = args.get('--app');
  const dmgPath = args.get('--dmg');
  const landingPath = args.get('--landing');
  const version = args.get('--version');

  if (!appPath || !dmgPath || !landingPath || !version) {
    console.error(
      'Использование: update-landing-release.js --app <.app> --dmg <.dmg> ' +
        '--landing <index.html> --version <x.y.z>',
    );
    process.exit(1);
  }

  const appBytes = appSizeBytes(appPath);
  const dmgBytes = fs.statSync(dmgPath).size;
  const html = fs.readFileSync(landingPath, 'utf8');
  const updated = applyReleaseInfo(html, { version, dmgBytes, appBytes });

  fs.writeFileSync(landingPath, updated);
  console.log(
    `==> Лендинг обновлён: v${version}, DMG ${formatMb(dmgBytes)} МБ, ` +
      `установленное ${formatMb(appBytes)} МБ`,
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { applyReleaseInfo, appSizeBytes, formatMb };
