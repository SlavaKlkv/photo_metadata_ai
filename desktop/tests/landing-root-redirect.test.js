'use strict';

const fs = require('fs');
const path = require('path');

const rootPath = path.resolve(__dirname, '../../docs/index.html');
const landingUrl = 'https://slavaklkv.github.io/photo_metadata_ai/landing/';

function readRoot() {
  return fs.readFileSync(rootPath, 'utf8');
}

// Корень Pages — это адрес из блока Deployments в шапке репозитория.
// Без этого файла он отдаёт 404, потому что лендинг лежит в landing/.
test('корень docs/ существует и уводит на лендинг', () => {
  const html = readRoot();

  expect(html).toMatch(/<meta\s+http-equiv="refresh"\s+content="0;\s*url=landing\/"/);
  expect(html).toMatch(/<a href="landing\/">/);
});

// Редирект-заглушка не должна конкурировать с лендингом в выдаче:
// canonical отдаёт вес лендингу, noindex убирает саму заглушку.
test('заглушка не индексируется и указывает canonical на лендинг', () => {
  const html = readRoot();

  expect(html).toMatch(/<meta name="robots" content="noindex">/);
  expect(html).toContain(`<link rel="canonical" href="${landingUrl}">`);
});

// Ссылки внутри заглушки относительные: иначе переезд на свой домен
// или смена имени репозитория молча их сломает.
test('ссылки на ресурсы относительные', () => {
  const html = readRoot();
  const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  const external = hrefs.filter((href) => /^https?:\/\//.test(href));

  expect(external).toEqual([landingUrl]);
});
