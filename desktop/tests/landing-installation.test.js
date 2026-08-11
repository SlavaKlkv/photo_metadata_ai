'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

test('блок установки остаётся лёгким и сохраняет все три шага', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const install = html.match(/<!-- INSTALL -->([\s\S]*?)<!-- FAQ -->/);

  expect(install).not.toBeNull();
  expect(install[1].match(/class="install-step"/g)).toHaveLength(3);
  expect(install[1]).not.toContain('class="panel"');
  expect(install[1]).toContain('Локальная модель (опционально)');
  expect(install[1]).toContain('Под капотом');
});

test('строка совместимости называет минимальную версию macOS и обе архитектуры', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const compat = html.match(/<p class="install-compat">([\s\S]*?)<\/p>/);

  expect(compat).not.toBeNull();
  expect(compat[1]).toContain('macOS 11 или новее');
  expect(compat[1]).toContain('Apple Silicon');
  // Intel больше не поддерживается — обещать совместимость нельзя.
  expect(compat[1]).not.toContain('Intel');
});

test('технические детали доступны нативно и свёрнуты по умолчанию', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const install = html.match(/<!-- INSTALL -->([\s\S]*?)<!-- FAQ -->/);
  const details = install[1].match(/<details class="install-tech">([\s\S]*?)<\/details>/);

  expect(details).not.toBeNull();
  expect(details[0]).not.toMatch(/<details[^>]*\sopen(?:\s|>)/);
  expect(details[1]).toMatch(/<summary>[\s\S]*Технические детали[\s\S]*<\/summary>/);
  expect(details[1]).toContain('Локальная модель и стек приложения');
  expect(details[1]).toContain('class="install-details"');
  expect(details[1]).toContain('class="install-note"');
  expect(details[1]).toMatch(/<svg[^>]*aria-hidden="true"/);
});

test('анимация установки подключена к viewport и reduced motion', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const reducedMotion = html.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/);

  expect(html).toContain("'.split > div, .install-shell, .final'");
  expect(html).toMatch(/\.reveal\.in \.install-step-copy\s*{[^}]*animation:/);
  expect(html).toMatch(/\.install-tech\[open\] \.install-tech-content\s*{[^}]*animation:/);
  expect(reducedMotion).not.toBeNull();
  expect(reducedMotion[1]).toContain('.reveal.in .install-step-copy');
  expect(reducedMotion[1]).toContain('.install-tech[open] .install-tech-content { animation: none; }');
  expect(reducedMotion[1]).toContain('animation: none');
});
