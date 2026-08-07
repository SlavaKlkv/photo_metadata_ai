'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

test('маппинг сохраняет три площадки без бегущей полосы', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const mapping = html.match(/<!-- MAPPING -->([\s\S]*?)<!-- HOW -->/);

  expect(mapping).not.toBeNull();
  expect(mapping[1].match(/class="mapping-platform"/g)).toHaveLength(3);
  expect(mapping[1]).toContain('Adobe Stock');
  expect(mapping[1]).toContain('Getty Images');
  expect(mapping[1]).toContain('Shutterstock');
  expect(html).not.toContain('.mapping-grid::after');
  expect(html).not.toContain('mapping-scan');
});

test('колонки подсвечиваются по очереди и останавливаются при reduced motion', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const reducedMotion = html.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/);

  expect(html).toMatch(/\.mapping-platform\.reveal\.in\s*{[^}]*animation:\s*mapping-focus/);
  expect(html).toContain('.mapping-platform:nth-child(2) { --mapping-phase: 3s; }');
  expect(html).toContain('.mapping-platform:nth-child(3) { --mapping-phase: 6s; }');
  expect(reducedMotion).not.toBeNull();
  expect(reducedMotion[1]).toMatch(
    /\.mapping-platform\.reveal\.in,[\s\S]*?\.mapping-platform\.reveal\.in h3\s*{\s*animation:\s*none;/,
  );
});
