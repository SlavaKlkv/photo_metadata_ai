'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function privacySection(html) {
  return html.match(/<!-- PRIVACY -->([\s\S]*?)<!-- INSTALL -->/);
}

// Два proof-пункта — публичное обещание локальности: ключи у пользователя
// и данные вне .app. Карта маршрута дополняет, но не заменяет их.
test('приватность держит два доказательства локальной работы', () => {
  const html = readLanding();
  const privacy = privacySection(html);

  expect(privacy).not.toBeNull();
  expect(privacy[1].match(/class="privacy-proof"/g)).toHaveLength(2);
  expect(privacy[1]).toContain('Ключи остаются у вас');
  expect(privacy[1]).toContain('Данные не исчезают');
  expect(privacy[1]).toContain('.app');
});

test('карта данных показывает локальный контур и офлайн-путь через Ollama', () => {
  const html = readLanding();
  const privacy = privacySection(html);

  expect(privacy[1]).toContain('class="privacy-map"');
  expect(privacy[1]).toContain('Контур macOS');
  expect(privacy[1]).toContain('Ollama · полностью офлайн');
  expect(privacy[1]).toContain('Облачный AI на ваш выбор');
  expect(privacy[1]).toMatch(/class="route-node source"/);
  expect(privacy[1]).toMatch(/class="route-node core"/);
  expect(privacy[1]).toMatch(/class="route-node output"/);
});

test('анимация proof-пунктов останавливается при reduced motion', () => {
  const html = readLanding();
  const reducedMotion = html.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/);

  expect(reducedMotion).not.toBeNull();
  expect(reducedMotion[1]).toMatch(/\.reveal\.in \.privacy-proof/);
  expect(reducedMotion[1]).toContain('animation: none');
});
