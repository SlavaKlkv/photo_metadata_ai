'use strict';

const fs = require('fs');
const path = require('path');

const termsPath = path.resolve(__dirname, '../../docs/landing/terms.html');

test('ссылки на LICENSE ведут на ветку main', () => {
  const html = fs.readFileSync(termsPath, 'utf8');
  const licenseUrl =
    'https://github.com/SlavaKlkv/photo_metadata_ai/blob/main/LICENSE';

  expect(html).toContain(`href="${licenseUrl}"`);
  expect(html).not.toContain('blob/develop/LICENSE');
  expect([...html.matchAll(/blob\/main\/LICENSE/g)]).toHaveLength(2);
});

test('ссылки на LICENSE и репозиторий открываются в новой вкладке', () => {
  const html = fs.readFileSync(termsPath, 'utf8');
  const external = [
    ...html.matchAll(
      /<a\b[^>]*href="https:\/\/github\.com\/SlavaKlkv\/photo_metadata_ai[^"]*"[^>]*>/g,
    ),
  ].map((m) => m[0]);

  expect(external).toHaveLength(3);
  for (const tag of external) {
    expect(tag).toMatch(/target="_blank"/);
    expect(tag).toMatch(/rel="noopener"/);
  }
});
