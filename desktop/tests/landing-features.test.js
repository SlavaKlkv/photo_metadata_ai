'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

test('блок возможностей остаётся компактным и не дублирует следующие разделы', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const features = html.match(/<section id="features">([\s\S]*?)<\/section>/);

  expect(features).not.toBeNull();
  expect(features[1].match(/class="feature-item"/g)).toHaveLength(3);
  expect(features[1]).not.toMatch(/Правила стоков|Онбординг|Экспорт/);
});
