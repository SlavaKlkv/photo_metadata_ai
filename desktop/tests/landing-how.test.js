'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function howSection(html) {
  return html.match(/<!-- HOW -->([\s\S]*?)<!-- SCREENS -->/);
}

// Мастер — линейный публичный сценарий приложения; порядок шагов должен
// совпадать с продуктом и с шкалой в hero-мокапе.
test('мастер из пяти шагов сохраняет продуктовый сценарий по порядку', () => {
  const html = readLanding();
  const how = howSection(html);

  expect(how).not.toBeNull();

  const titles = [...how[1].matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  expect(titles).toEqual(['Upload', 'Context', 'Process', 'Review', 'Export']);
  expect(how[1].match(/class="step"/g)).toHaveLength(5);
  expect(how[1]).toMatch(/<ol class="steps">/);
});

test('нумерация шагов идёт подряд от 1 до 5', () => {
  const html = readLanding();
  const how = howSection(html);
  const numbers = [...how[1].matchAll(/<span class="n"[^>]*>(\d+)<\/span>/g)].map((m) => m[1]);

  expect(numbers).toEqual(['1', '2', '3', '4', '5']);
});
