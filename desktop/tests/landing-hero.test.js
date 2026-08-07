'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

test('бейдж hero указывает минимальную версию macOS', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const badge = html.match(/<span class="badge">([\s\S]*?)<\/span>/);

  expect(badge).not.toBeNull();
  expect(badge[1]).toContain('macOS 11+');
});

test('подпись у кнопки скачивания называет размер DMG', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const note = html.match(/<p class="cta-note">([\s\S]*?)<\/p>/);

  expect(note).not.toBeNull();
  expect(note[1]).toContain('DMG ~230 МБ');
});

test('числа статусных чипов в hero-мокапе сходятся с «All»', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const chipsBlock = html.match(/<div class="mock-chips">([\s\S]*?)<\/div>/);

  expect(chipsBlock).not.toBeNull();

  const chips = [...chipsBlock[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
    .map(([, inner]) => inner.replace(/<[^>]*>/g, '').trim());
  const all = chips.find((chip) => chip.startsWith('All'));

  expect(all).toBeDefined();

  const total = Number(all.match(/\d+/)[0]);
  const sum = chips
    .filter((chip) => chip !== all)
    .reduce((acc, chip) => acc + Number(chip.match(/(\d+)\s*$/)[1]), 0);

  expect(sum).toBe(total);
});

test('летающая частица без явных круглых границ определена со стилями прозрачности и интерактивности', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const flagsPath = path.resolve(__dirname, '../../docs/landing/ambient-particle-flags.js');
  const flags = fs.readFileSync(flagsPath, 'utf8');

  expect(html).toContain('class="ambient-particle"');
  expect(html).toContain('src="ambient-particle-flags.js"');
  expect(html).toContain('.ambient-particle.is-dimmed');
  expect(html).toContain('.ambient-particle.is-near-cursor');
  expect(html).toContain('.ambient-particle.is-impulsed');
  expect(html).toContain('particle-morph');
  expect(html).toContain('radial-gradient(45% 42% at 38% 40%');
  expect(html).not.toContain("'rotate(' + rotation.toFixed(1)");
  expect(html).toContain('pointermove');
  expect(html).toContain('elementFromPoint');
  expect(html).toContain("clickPhase = 'out'");
  expect(html).toContain('applyClickImpulse');
  expect(html).not.toContain('speed = Math.min(speed + 170, 270)');
  expect(html).not.toContain('linear-gradient(90deg, transparent 4%');
  // Переключатели в общем файле, значения отдельно для index / screens.
  expect(flags).toContain('LANDING_PARTICLE_FLAGS');
  expect(flags).toContain('function getLandingParticleFlags');
  expect(flags).toMatch(/index:\s*\{[\s\S]*?ENABLE_AMBIENT_PARTICLE:\s*true/);
  expect(flags).toMatch(/index:\s*\{[\s\S]*?ENABLE_HOVER_ATTRACTION:\s*false/);
  expect(flags).toMatch(/screens:\s*\{[\s\S]*?ENABLE_AMBIENT_PARTICLE:\s*true/);
  expect(flags).toMatch(/screens:\s*\{[\s\S]*?ENABLE_HOVER_ATTRACTION:\s*false/);
  expect(html).toContain("getLandingParticleFlags('index')");
  expect(html).toContain('if (!ENABLE_AMBIENT_PARTICLE)');
  expect(html).toContain('particle.remove()');
  // Дефолты флагов не захардкожены в HTML — только в shared-файле.
  expect(html).not.toMatch(/ENABLE_AMBIENT_PARTICLE:\s*(?:true|false)/);
  expect(html).not.toMatch(/ENABLE_HOVER_ATTRACTION:\s*(?:true|false)/);
});

test('обе страницы лендинга подключают общий файл флагов и выбирают свой ключ', () => {
  const landingDir = path.resolve(__dirname, '../../docs/landing');
  const indexHtml = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
  const screensHtml = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');

  expect(indexHtml).toContain('src="ambient-particle-flags.js"');
  expect(screensHtml).toContain('src="ambient-particle-flags.js"');
  expect(indexHtml).toContain("getLandingParticleFlags('index')");
  expect(screensHtml).toContain("getLandingParticleFlags('screens')");
  expect(fs.existsSync(path.join(landingDir, 'ambient-particle-flags.js'))).toBe(true);
});

test('клик по подтянувшейся частице плавно ускоряет её от контента', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toContain('function getHorizontalEscapeDirection(px, py)');
  expect(html).toContain('function getVerticalWanderDirection()');
  expect(html).toContain('function pointIsOverContent(px, py)');
  expect(html).toContain('getBoundingClientRect()');
  expect(html).toContain('if (ENABLE_HOVER_ATTRACTION && !isHoverCaptured) return');
  expect(html).toContain('Math.sqrt(clickX * clickX + clickY * clickY)');
  expect(html).toContain("clickPhase = 'out'");
  expect(html).toContain("clickPhase = 'turn'");
  expect(html).toContain('clickDirection = getHorizontalEscapeDirection(viewX, viewY)');
  expect(html).toContain('clickDirection = getVerticalWanderDirection()');
  expect(html).toContain('hoverSuppressedUntil = clickImpulseTime + 5200');
  expect(html).toContain('flightLockedAfterClick = true');
  expect(html).toContain('mouseDist >= 300');
  expect(html).toContain('var clickTargetSpeed = 92 + clickEase * 58');
  expect(html).toContain('(time - clickImpulseTime) / 1800');
  expect(html).toContain('(time - clickImpulseTime) / 1400');
  // Горизонтальный выход (примерно L/R), затем вертикаль 50/50 поочерёдно.
  expect(html).toContain('nextVerticalUp = !nextVerticalUp');
  expect(html).toContain('getVerticalWanderDirection');
  // Follow-код сохранён, но заглушён флагом из ambient-particle-flags.js (ключ index).
  expect(html).toContain('var isNear = ENABLE_HOVER_ATTRACTION && isHoverCaptured && !flightLockedAfterClick');
  expect(
    fs.readFileSync(
      path.resolve(__dirname, '../../docs/landing/ambient-particle-flags.js'),
      'utf8',
    ),
  ).toMatch(/index:\s*\{[\s\S]*?ENABLE_HOVER_ATTRACTION:\s*false/);
});

test('частица привязана к document-space и уезжает со страницей при скролле', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toContain('function syncViewFromPage()');
  expect(html).toContain('viewX = pageX - window.scrollX');
  expect(html).toContain('viewY = pageY - window.scrollY');
  expect(html).toContain('function wrapInViewport()');
  // Главная: появление слева снизу.
  expect(html).toContain("pageX = window.scrollX + window.innerWidth * .12");
  expect(html).toContain("pageY = window.scrollY + window.innerHeight * .88");
  expect(html).toContain(
    "'translate3d(' + viewX.toFixed(1) + 'px,' + viewY.toFixed(1) + 'px,0) scale(' + scale.toFixed(2) + ')'"
  );
  // Не рисуем из сырых page-координат — иначе fixed-слой «отлипает» от скролла.
  expect(html).not.toContain(
    "'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + scale.toFixed(2) + ')'"
  );
});

test('возле курсора частица следует за плавной хаотичной целью без орбитального движения', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toContain('var hoverX =');
  expect(html).toContain('var hoverY =');
  expect(html).toContain('var follow = Math.min(1, delta * 4.2)');
  expect(
    fs.readFileSync(
      path.resolve(__dirname, '../../docs/landing/ambient-particle-flags.js'),
      'utf8',
    ),
  ).toMatch(/index:\s*\{[\s\S]*?ENABLE_HOVER_ATTRACTION:\s*false/);
  expect(html).not.toContain('var angleToMouse = Math.atan2(dy, dx)');
});

test('hero-мокап масштабируется от ширины контейнера, а не фиксированным --u', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toContain('container-type: inline-size');
  expect(html).toMatch(/\.mock\s*\{[^}]*--u:\s*clamp\(/s);
  expect(html).toContain('100cqi / 620');
  expect(html).toContain('100cqi / 440');
  // Фиксированные «магические» пиксели масштаба больше не должны выигрывать.
  expect(html).not.toMatch(/\.mock\s*\{\s*--u:\s*1px\s*;/);
  expect(html).not.toMatch(/\.mock\s*\{\s*--u:\s*\.82px\s*;/);
});

test('hero-мокап держит заданную пропорцию окна и тянется вместе с колонкой', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Окно намеренно выше пропорций скриншота приложения: 3D-разворот его
  // сплющивает, а списку результатов нужно место на восемь строк.
  expect(html).toMatch(/\.mock\s*\{[^}]*aspect-ratio:\s*8\s*\/\s*7\.6\s*;/s);
  expect(html).toMatch(/\.mock-body\s*\{[^}]*flex:\s*1 1 auto/s);
  expect(html).toMatch(/\.mock-cols\s*\{[^}]*flex:\s*1 1 auto/s);
});

test('шкала шагов в hero-мокапе подсвечивает Review, а не Export', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const steps = html.match(/<div class="mock-steps">([\s\S]*?)<\/div>/);

  expect(steps).not.toBeNull();
  expect(steps[1]).toMatch(/class="now"[^>]*>\s*<i>4<\/i>\s*Review/);
  expect(steps[1]).not.toMatch(/class="now"[^>]*>\s*<i>5<\/i>\s*Export/);
  expect(steps[1]).toMatch(/<span><i>5<\/i>Export<\/span>/);
});

test('в полосе шагов hero-мокапа шкала слева, а действие прижато вправо', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const steps = html.match(/<div class="mock-steps">([\s\S]*?)<\/div>/);

  expect(steps).not.toBeNull();
  expect(steps[1]).toContain('Start processing');
  expect(steps[1].indexOf('mock-action')).toBeGreaterThan(
    steps[1].indexOf('<i>5</i>Export'),
  );
  expect(html).toMatch(/\.mock-steps\s*\{[^}]*justify-content:\s*flex-start/s);
  expect(html).toMatch(
    /\.mock-steps \.mock-action\s*\{[^}]*margin-left:\s*auto/s,
  );
});

test('hero-мокап сохраняет упрощённую двухпанельную композицию', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const mockColumns = html.match(
    /<div class="mock-cols">([\s\S]*?)<div class="mock-steps">/,
  );

  expect(mockColumns).not.toBeNull();
  expect(
    [...mockColumns[1].matchAll(/<section class="mock-panel(?: mock-preview)?">/g)],
  ).toHaveLength(2);
  expect(mockColumns[1]).toContain('<h4>Results</h4>');
  expect(mockColumns[1]).toContain('<h4>Metadata Preview</h4>');
  expect(mockColumns[1]).not.toContain('mock-context');
  expect(html).toMatch(
    /\.mock-cols\s*\{[^}]*grid-template-columns:\s*1\.34fr 1fr/s,
  );
});

test('выбранная строка Results связана с содержимым Metadata Preview', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const selectedRow = html.match(
    /<div class="mock-row on">([\s\S]*?)<\/div>/,
  );
  const preview = html.match(
    /<section class="mock-panel mock-preview">([\s\S]*?)<\/section>/,
  );

  expect(selectedRow).not.toBeNull();
  expect(preview).not.toBeNull();
  expect(selectedRow[1]).toContain('040_004_2018_05_1');
  expect(selectedRow[1]).toContain('Lightning Storm');
  expect(preview[1]).toContain('040_004_2018_05_1.jpg');
  expect(preview[1]).toContain('Lightning Storm at Twilight');
  expect(preview[1]).toContain('class="mock-lightning"');
  expect(preview[1]).toContain('class="mock-field-state edited">Edited');
});

test('кадр в Metadata Preview занимает 2/3 своей колонки и держит пропорции фотографии', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Ширина ведущая (доля колонки), высота считается из неё по 4:3. Если вернуть
  // высоту от flex, кадр снова ужмётся примерно до 55% ширины панели.
  expect(html).toMatch(/\.mock-photo\s*\{[^}]*width:\s*66\.6%/s);
  expect(html).toMatch(/\.mock-photo\s*\{[^}]*flex:\s*0 0 auto/s);
  expect(html).toMatch(/\.mock-photo\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/s);
  // Без этого flex растянул бы кадр по ширине панели и 4:3 бы не соблюдалось.
  expect(html).toMatch(/\.mock-photo\s*\{[^}]*align-self:\s*center/s);
  expect(html).toMatch(/\.mock-photo\s*\{[^}]*max-width:\s*100%/s);
});

test('поля Metadata Preview ужаты по вертикали, чтобы keywords помещались под выросшим кадром', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Высота панели задана пропорциями окна, поэтому место под кадр берётся из
  // вертикальных интервалов — и только по вертикали: боковые отступы держат
  // ширину колонки, от которой считаются 2/3 кадра.
  expect(html).toMatch(/\.mock-preview\s*\{\s*padding-block:\s*calc\(9 \* var\(--u\)\)/s);
  expect(html).toMatch(
    /\.mock-preview \.mock-field\s*\{[^}]*padding-block:\s*calc\(5 \* var\(--u\)\)/s,
  );
  expect(html).toMatch(
    /\.mock-preview \.mock-label-line\s*\{\s*margin-bottom:\s*calc\(3 \* var\(--u\)\)/s,
  );
});

test('hero-мокап имеет отдельные слои для перспективы, плавания и реакции на курсор', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toMatch(/\.hero-visual\s*\{[^}]*perspective:\s*1380px/s);
  expect(html).toMatch(
    /class="mock-stage"[\s\S]*?class="mock-depth"[\s\S]*?class="mock-float"[\s\S]*?class="mock"/,
  );
  expect(html).toMatch(/\.mock-depth\s*\{[^}]*--mock-ry:\s*-9deg/s);
  expect(html).toContain('@keyframes mock-turn-in');
  expect(html).toContain('@keyframes mock-float');
  expect(html).toContain("stage.style.setProperty('--tilt-x'");
  expect(html).toContain("stage.style.setProperty('--tilt-y'");
});

test('reduced motion отключает движение, но сохраняет боковую перспективу', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toMatch(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mock-depth\s*\{[\s\S]*?animation:\s*none;[\s\S]*?rotateY\(var\(--mock-ry\)\)/,
  );
  expect(html).toMatch(
    /\.mock-float,\s*\.mock-row\.on::after,\s*\.mock-photo::before,\s*\.mock-lightning,[\s\S]*?animation:\s*none;/,
  );
});
