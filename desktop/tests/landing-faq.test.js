'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

function readLanding() {
  return fs.readFileSync(landingPath, 'utf8');
}

function faqSection(html) {
  return html.match(/<!-- FAQ -->([\s\S]*?)<!-- FINAL CTA -->/);
}

// Четыре ответа закрывают типовые блокеры перед установкой: Gatekeeper,
// AI-провайдер, JPEG-only и обновления. Потеря пункта — дыра в onboarding.
test('FAQ сохраняет четыре вопроса в фиксированном порядке', () => {
  const html = readLanding();
  const faq = faqSection(html);

  expect(faq).not.toBeNull();

  const titles = [...faq[1].matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  expect(titles).toEqual([
    'Почему macOS ругается при первом запуске?',
    'Что нужно, чтобы заработал AI?',
    'Какие файлы можно загружать?',
    'Как выходят обновления?',
  ]);
  expect(faq[1].match(/<span class="n">0\d<\/span>/g)).toHaveLength(4);
});

test('ответы фиксируют Gatekeeper, AI-вариант, JPEG и ручные обновления', () => {
  const html = readLanding();
  const faq = faqSection(html)[1];

  // На macOS 15+ ни один GUI-обход не работает: проверено на скачанном из
  // релиза образе. Обещать «Открыть всё равно» как рабочий путь нельзя —
  // остаётся только снятие карантина в терминале.
  expect(faq).toContain('карантин');
  expect(faq).toContain('xattr -dr com.apple.quarantine');
  expect(faq).not.toMatch(/нажмите «Открыть всё равно»/);
  expect(faq).toMatch(/Ollama|Qwen2\.5-VL|Gemini|OpenRouter/);
  expect(faq).toContain('JPEG');
  expect(faq).toContain('оригиналы остаются нетронутыми');
  expect(faq).toContain('.dmg');
  expect(faq).toMatch(/ручн/i);
});
