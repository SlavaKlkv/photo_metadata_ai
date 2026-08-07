'use strict';

const fs = require('fs');
const path = require('path');

const screensPath = path.resolve(__dirname, '../../docs/landing/screens.html');

function readScreens() {
  return fs.readFileSync(screensPath, 'utf8');
}

// Галерея — полный продуктовый путь: ровно 15 экранов с id shot-NN_… и
// data-src / data-title / data-caption, без которых лайтбокс и deep-link
// с главной ломаются.
describe('галерея экранов', () => {
  test('содержит ровно 15 кнопок с id, data-src, data-title и data-caption', () => {
    const html = readScreens();
    const gallery = html.match(/<div class="gallery" id="gallery">([\s\S]*?)<\/div>\s*<\/main>/);

    expect(gallery).not.toBeNull();

    const buttons = [...gallery[1].matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(15);

    for (const tag of buttons) {
      expect(tag).toMatch(/\bid="shot-\d{2}_[^"]+"/);
      expect(tag).toMatch(/\bdata-src="\.\.\/screenshots\/[^"]+\.png"/);
      expect(tag).toMatch(/\bdata-title="/);
      expect(tag).toMatch(/\bdata-caption="/);
      expect(tag).toMatch(/\btype="button"/);
    }
  });

  test('нумерация id идёт подряд от 01 до 15', () => {
    const html = readScreens();
    const ids = [...html.matchAll(/id="(shot-(\d{2})_[^"]+)"/g)].map((m) => m[2]);

    expect(ids).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15',
    ]);
  });

  test('deep-link с главной (#shot-…) открывается через hashchange', () => {
    const html = readScreens();

    // openFromHash читает location.hash и ищет item.id — без этого
    // screens.html#shot-07_… с лендинга открывает просто страницу.
    expect(html).toContain('function openFromHash');
    expect(html).toContain("window.location.hash.slice(1)");
    expect(html).toContain("addEventListener('hashchange', openFromHash)");
    expect(html).toContain('openFromHash()');
    expect(html).toContain('dialog.showModal()');
    // Старый strip-hash «переход» не возвращаем — каскад самодостаточен.
    expect(html).not.toContain('__LANDING_SHOT');
    expect(html).not.toContain('function shotIdFromLocation');
  });

  test('лайтбокс листается стрелками и кнопками prev/next', () => {
    const html = readScreens();

    expect(html).toContain('id="lb-prev"');
    expect(html).toContain('id="lb-next"');
    expect(html).toContain('id="lb-close"');
    // Стрелки с document; focus shell — dialog, не «первая нажатая» chrome-кнопка.
    expect(html).toContain("document.addEventListener('keydown'");
    expect(html).toContain('if (!dialog.open) return');
    expect(html).toContain('function openAt');
    expect(html).toContain('function shellFocus');
    expect(html).toContain('dialog.focus({ preventScroll: true })');
    expect(html).toMatch(/tabindex="-1"/);
    expect(html).toContain('dialog.lightbox:focus { outline: none; }');
    expect(html).toMatch(/\.lb-btn:focus-visible/);
    expect(html).toMatch(/event\.key === 'ArrowRight'/);
    expect(html).toMatch(/event\.key === 'ArrowLeft'/);
    // Зацикливание: 1→15 и 15→1 через go/wrap, кнопки не disabled на краях.
    expect(html).toContain('function wrap');
    expect(html).toContain('function go');
    expect(html).toContain('go(1)');
    expect(html).toContain('go(-1)');
    expect(html).toMatch(/show\(wrap\(current \+ direction\), direction\)/);
    expect(html).not.toMatch(/prev\.disabled\s*=/);
    expect(html).not.toMatch(/next\.disabled\s*=/);
  });

  test('после закрытия лайтбокса снимается фокус с плитки (без липкой обводки)', () => {
    const html = readScreens();

    // close → blur на gallery button, иначе Esc оставляет :focus-visible ring.
    expect(html).toContain("addEventListener('close'");
    expect(html).toContain('queueMicrotask');
    expect(html).toContain('el.blur()');
    expect(html).toContain('items.indexOf(el)');
  });

  test('каскад плиток: early js-cascade + keyframes, без transition-reveal', () => {
    const html = readScreens();
    const markup = html.slice(0, html.indexOf('<script src="ambient-particle-flags.js">'));

    // Подсказка «Открыть» — только из JS.
    expect(markup).not.toContain('class="zoom"');
    expect(html).toContain("hint.className = 'zoom'");

    // Head помечает html до paint; без JS / reduce класс не ставится.
    expect(html).toContain("document.documentElement.classList.add('js-cascade')");
    expect(html).toMatch(
      /html\.js-cascade #gallery button:not\(\.cascade-in\):not\(\.is-shown\)\s*\{/,
    );
    expect(html).toContain('cascade-in');
    expect(html).toContain('is-shown');
    expect(html).toContain('@keyframes reveal-in');
    expect(html).toContain('IntersectionObserver');
    // Каскад — анимация, не transition opacity на reveal.
    expect(html).not.toMatch(/\.reveal\s*\{\s*opacity:\s*0/);
    expect(html).toMatch(/prefers-reduced-motion:\s*reduce/);
    // Ступеньки волны: --d от индекса в batch.
    expect(html).toContain("setProperty('--d'");
    expect(html).toContain("classList.add('cascade-in')");
    expect(html).toContain("classList.add('is-shown')");
  });

  test('летающая частица появляется справа посередине', () => {
    const html = readScreens();

    expect(html).toContain('pageX = window.scrollX + window.innerWidth * .88');
    expect(html).toContain('pageY = window.scrollY + window.innerHeight * .5');
  });
});
