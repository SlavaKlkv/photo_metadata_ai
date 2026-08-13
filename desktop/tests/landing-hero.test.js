'use strict';

const fs = require('fs');
const path = require('path');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');

// Вырезает spawnAtRandomOnPage из разметки и возвращает вызываемую обёртку:
// так проверяется реальное поведение появления, а не текст исходника.
function makeSpawner(html, docW, docH, margin) {
  const start = html.indexOf('function spawnAtRandomOnPage()');
  expect(start).toBeGreaterThan(-1);

  let depth = 0;
  let end = -1;
  for (let i = html.indexOf('{', start); i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  expect(end).toBeGreaterThan(start);

  const factory = new Function('window', 'document', 'margin', `
    var pageX, pageY, heading, clickDirection;
    ${html.slice(start, end)}
    return function () {
      spawnAtRandomOnPage();
      return { pageX: pageX, pageY: pageY, heading: heading, clickDirection: clickDirection };
    };
  `);
  const root = { clientWidth: docW, scrollWidth: docW, clientHeight: docH, scrollHeight: docH };
  return factory(
    { innerWidth: Math.min(docW, 1200), innerHeight: Math.min(docH, 800) },
    { documentElement: root, body: root },
    margin,
  );
}

describe.each([
  ['index.html', path.resolve(__dirname, '../../docs/landing/index.html')],
  ['screens.html', path.resolve(__dirname, '../../docs/landing/screens.html')],
])('появление частицы на %s', (_name, filePath) => {
  // Документ выше viewport: края — всего документа, не только первого экрана.
  const docW = 1200;
  const docH = 4000;
  const margin = 40;

  test('стартует с любого края документа и летит в случайную сторону', () => {
    const spawn = makeSpawner(fs.readFileSync(filePath, 'utf8'), docW, docH, margin);
    const edges = new Set();
    const headings = new Set();
    let maxEdgeY = -Infinity;

    for (let i = 0; i < 400; i += 1) {
      const { pageX, pageY, heading, clickDirection } = spawn();

      if (pageX === -margin) edges.add('left');
      else if (pageX === docW + margin) edges.add('right');
      else if (pageY === -margin) edges.add('top');
      else if (pageY === docH + margin) edges.add('bottom');
      else throw new Error(`точка появления не на краю документа: ${pageX},${pageY}`);

      // Вдоль края — не в самом углу; для боковых — координата по всей высоте дока.
      if (pageX === -margin || pageX === docW + margin) {
        expect(pageY).toBeGreaterThan(0);
        expect(pageY).toBeLessThan(docH);
        maxEdgeY = Math.max(maxEdgeY, pageY);
      } else {
        expect(pageX).toBeGreaterThan(0);
        expect(pageX).toBeLessThan(docW);
      }

      // Курс — полный круг, не конус «внутрь».
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(Math.PI * 2);
      expect(clickDirection).toBe(heading);

      headings.add(heading);
    }

    expect(Array.from(edges).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    // Боковые края охватывают страницу ниже первого экрана.
    expect(maxEdgeY).toBeGreaterThan(docH * .7);
    // Направление случайное, а не одно и то же для всех появлений.
    expect(headings.size).toBeGreaterThan(300);
  });
});

test('бейдж hero указывает минимальную версию macOS', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const badge = html.match(/<span class="badge">([\s\S]*?)<\/span>/);

  expect(badge).not.toBeNull();
  expect(badge[1]).toContain('macOS 11+');
});

// Конкретные числа не зашиваются: их проставляет релизный workflow по
// фактическим артефактам. Здесь важно, что подпись называет оба размера —
// сколько качать и сколько займёт после установки.
test('подпись у кнопки скачивания называет объём загрузки и место после установки', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const note = html.match(/<p class="cta-note">([\s\S]*?)<\/p>/);

  expect(note).not.toBeNull();
  expect(note[1]).toMatch(/Загрузка \d+ МБ · после установки \d+ МБ<br>без регистрации/);
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

test('летающая частица — небольшая искра со стилями прозрачности и интерактивности', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const flagsPath = path.resolve(__dirname, '../../docs/landing/ambient-particle-flags.js');
  const flags = fs.readFileSync(flagsPath, 'utf8');
  const particleCss = html.match(/\.ambient-particle\s*\{([^}]*)\}/);

  expect(html).toContain('class="ambient-particle"');
  expect(html).toContain('src="ambient-particle-flags.js"');
  expect(html).toContain('.ambient-particle.is-dimmed');
  expect(html).toContain('.ambient-particle.is-near-cursor');
  expect(html).toContain('.ambient-particle.is-impulsed');
  // Искра: точечное круглое ядро, а не расплывшееся пятно на полсотни пикселей.
  expect(particleCss).not.toBeNull();
  expect(particleCss[1]).toMatch(/border-radius:\s*50%/);
  expect(Number(particleCss[1].match(/width:\s*(\d+)px/)[1])).toBeLessThanOrEqual(20);
  expect(particleCss[1]).toMatch(/filter:\s*blur\(0?\.\d+px\)/);
  expect(html).toContain('particle-twinkle');
  expect(html).toContain('particle-halo');
  // Летит неспешно: на глаз частица быстрее ~40 px/с читается как «куда-то мчится».
  const cruiseSpeed = Number(
    html.match(/var targetSpeed = (\d+) \+ Math\.sin/)[1],
  );
  expect(cruiseSpeed).toBeLessThanOrEqual(40);
  expect(html).toMatch(new RegExp(`var speed = ${cruiseSpeed};`));
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
  expect(html).toContain('var clickTargetSpeed = 48 + clickEase * 30');
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

test.each([
  ['index.html', path.resolve(__dirname, '../../docs/landing/index.html')],
  ['screens.html', path.resolve(__dirname, '../../docs/landing/screens.html')],
])('частица на %s в page-space: не раздувает документ, wrap с противоположной стороны', (_name, filePath) => {
  const html = fs.readFileSync(filePath, 'utf8');
  const particleCss = html.match(/\.ambient-particle\s*\{([^}]*)\}/);

  expect(particleCss).not.toBeNull();
  // fixed не входит в scrollHeight — иначе absolute за краем раздувает страницу.
  expect(particleCss[1]).toMatch(/position:\s*fixed/);
  expect(particleCss[1]).not.toMatch(/position:\s*absolute/);

  expect(html).toContain('function syncViewFromPage()');
  expect(html).toContain('viewX = pageX - window.scrollX');
  expect(html).toContain('viewY = pageY - window.scrollY');
  // Тор по границам документа: уход за низ → появление сверху (и т.п.).
  expect(html).toContain('function wrapInDocument()');
  expect(html).not.toContain('function wrapInViewport()');
  expect(html).toContain('var spanX = docW + margin * 2');
  expect(html).toContain('var spanY = docH + margin * 2');
  // Появление — случайная точка на краю всего документа; курс — random full circle.
  expect(html).toContain('spawnAtRandomOnPage()');
  expect(html).toContain('pageX = docW * along');
  expect(html).toContain('pageY = docH * along');
  expect(html).toContain('pageX = docW + margin');
  expect(html).toContain('pageY = docH + margin');
  expect(html).toContain('heading = Math.random() * Math.PI * 2');
  expect(html).not.toContain('spawnFromRandomEdge');
  expect(html).not.toContain('pageX = Math.random() * docW');
  expect(html).not.toContain('pageY = Math.random() * docH');
  // Рисуем в client-координатах; page* — только логика полёта/скролла.
  expect(html).toContain(
    "'translate3d(' + viewX.toFixed(1) + 'px,' + viewY.toFixed(1) + 'px,0) scale(' + scale.toFixed(2) + ')'"
  );
  expect(html).not.toContain(
    "'translate3d(' + pageX.toFixed(1) + 'px,' + pageY.toFixed(1) + 'px,0) scale(' + scale.toFixed(2) + ')'"
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

  // Окно намеренно выше пропорций скриншота приложения (3424×2626 ≈ 1.30):
  // 3D-разворот его сплющивает, а списку результатов нужно место на восемь
  // строк. Точное значение — параметр подбора: панели тянутся за ним сами,
  // поэтому тест сторожит диапазон, а не конкретную цифру.
  const ratio = html.match(/\.mock\s*\{[^}]*aspect-ratio:\s*8\s*\/\s*([\d.]+)\s*;/s);

  expect(ratio).not.toBeNull();
  expect(Number.parseFloat(ratio[1])).toBeGreaterThanOrEqual(6.8);
  expect(Number.parseFloat(ratio[1])).toBeLessThanOrEqual(8);
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

test('кадр в Metadata Preview забирает запас панели и держит пропорции фотографии', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const photo = html.match(/\n {2}\.mock-photo\s*\{([\s\S]*?)\n {2}\}/);

  expect(photo).not.toBeNull();
  // Единственный тянущийся элемент панели: пропорция окна остаётся свободным
  // параметром — ниже окно, меньше кадр, и Category не срезается.
  expect(photo[1]).toMatch(/flex:\s*1 1 auto/);
  expect(photo[1]).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  // Ширина из высоты, а не доля колонки: иначе кадр снова станет фиксированным
  // и на другой пропорции окна вылезет за панель или оставит пустоту.
  expect(photo[1]).toMatch(/width:\s*auto/);
  expect(photo[1]).not.toMatch(/(?:^|\n)\s*width:\s*\d/);
  // Без этого flex растянул бы кадр по ширине панели и 4:3 бы не соблюдалось.
  expect(photo[1]).toMatch(/align-self:\s*center/);
  expect(photo[1]).toMatch(/max-width:\s*100%/);
  // Ограничители по краям диапазона: не полоска и не во всю ширину панели.
  expect(photo[1]).toMatch(/min-height:\s*calc\(76 \* var\(--u\)\)/);
  expect(photo[1]).toMatch(/max-height:\s*calc\(142 \* var\(--u\)\)/);
});

test('в Metadata Preview три поля без Description — иначе Category не помещается', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const preview = html.match(
    /<section class="mock-panel mock-preview">([\s\S]*?)<\/section>/,
  );

  expect(preview).not.toBeNull();

  const labels = [...preview[1].matchAll(/<span class="mock-label[^"]*">([^<]+)</g)]
    .map(([, text]) => text.trim());

  // Порядок и состав как в приложении, но без Description: при пропорции окна
  // 8/7.3 четвёртое поле выдавливает Category за нижний край панели.
  expect(labels).toEqual(['Title', 'Keywords', 'Category 1']);
  expect(preview[1]).toContain('Nature');
  expect(preview[1]).not.toContain('mock-field description');
  expect(html).not.toContain('79/2000 characters');
  // Подпись для скринридера перечисляет ровно те же поля.
  expect(html).toMatch(/aria-label="[^"]*Title, Keywords и Category/);
});

test('поля Metadata Preview ужаты по вертикали, чтобы keywords помещались под выросшим кадром', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Высота панели задана пропорциями окна, поэтому место под кадр берётся из
  // вертикальных интервалов — и только по вертикали: боковые отступы держат
  // ширину колонки, от которой считается доля кадра.
  expect(html).toMatch(/\.mock-preview\s*\{\s*padding-block:\s*calc\(10 \* var\(--u\)\)/s);
  expect(html).toMatch(
    /\.mock-preview \.mock-field\s*\{[^}]*padding-block:\s*calc\(6 \* var\(--u\)\)/s,
  );
  expect(html).toMatch(
    /\.mock-preview \.mock-label-line\s*\{\s*margin-bottom:\s*calc\(3\.5 \* var\(--u\)\)/s,
  );
});

test('строки Results выстроены таблицей: у всех колонок общие границы', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const row = html.match(/\n {2}\.mock-row\s*\{([\s\S]*?)\n {2}\}/);

  expect(row).not.toBeNull();
  // Последняя колонка фиксированной ширины: с auto её задавал самый длинный
  // провайдер в своей же строке, и заголовки шли лестницей от строки к строке.
  expect(row[1]).toMatch(/grid-template-columns:[^;]*calc\(50 \* var\(--u\)\);/s);
  expect(row[1]).not.toMatch(/grid-template-columns:[^;]*auto;/s);
  expect(html).toMatch(/\.mock-prov\s*\{[^}]*justify-self:\s*start/s);
  // Тот же приём в узком макете, где колонка заголовка скрыта.
  expect(html).toMatch(
    /\.mock-row\s*\{\s*grid-template-columns:\s*\n?\s*calc\(11 \* var\(--u\)\) calc\(24 \* var\(--u\)\)\s*\n?\s*minmax\(0, 1fr\) calc\(50 \* var\(--u\)\);/s,
  );
});

test('точки статуса есть только в фильтрах — строки списка ими не дробятся', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const dots = html.match(/\.mock-chips i\s*\{([^}]*)\}/);

  expect(dots).not.toBeNull();
  expect(dots[1]).toMatch(/width:\s*calc\(4 \* var\(--u\)\)/);
  expect(dots[1]).toMatch(/height:\s*calc\(4 \* var\(--u\)\)/);
  // В чипах точка — легенда к счётчику, в строке она была лишней мелочью.
  expect(html).toMatch(/<span><i class="dot-ok"><\/i>Ready/);
  expect(html).not.toMatch(/<span class="mock-title"><i/);
  // Правило для точек в строках тоже убрано, иначе останется мёртвый CSS.
  expect(html).not.toContain('.mock-title i');
  expect(html).not.toContain('dot-process');
});

test('список Results отбит от итоговой строки, а кадр строки заметен', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  expect(html).toMatch(/\.mock-rows\s*\{[^}]*margin-bottom:\s*calc\(5 \* var\(--u\)\)/s);
  expect(html).toMatch(/\.mock-thumb\s*\{[^}]*height:\s*calc\(18 \* var\(--u\)\)/s);
  expect(html).toMatch(/\.mock-row\s*\{[^}]*padding:\s*calc\(4 \* var\(--u\)\)/s);
});

test('картинка кадра не вылезает в рамку: плитка градиента равна border-box', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Плитка по умолчанию равна padding-box, а красится border-box, поэтому
  // рамка в 1px добиралась повтором: сверху проступал низ картинки, снизу —
  // верх. Объявление обязано идти после шортката `background`, иначе он его
  // сбросит.
  for (const selector of ['.mock-thumb', '.mock-photo']) {
    const block = html.match(
      new RegExp(`\\n {2}\\${selector}\\s*\\{([\\s\\S]*?)\\n {2}\\}`),
    );

    expect(block).not.toBeNull();
    expect(block[1]).toContain('background-origin: border-box;');
    expect(block[1].indexOf('background:')).toBeLessThan(
      block[1].indexOf('background-origin:'),
    );
  }

  // По той же причине варианты кадров задают только background-image: шорткат
  // вернул бы origin к padding-box, и повтор в рамке появился бы снова.
  const variants = [...html.matchAll(/\n {2}\.mock-thumb\.t\d\s*\{([\s\S]*?)\n {2}\}/g)];

  expect(variants).toHaveLength(8);

  for (const [, body] of variants) {
    expect(body).toMatch(/^\s*background-image:/);
    expect(body).not.toMatch(/\bbackground:/);
  }
});

test('молния в миниатюре — фигура разряда, а не полоса через весь кадр', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const thumb = html.match(/\n {2}\.mock-thumb\.t4\s*\{([\s\S]*?)\n {2}\}/);
  const bolt = html.match(/\n {2}\.mock-thumb\.t4::before\s*\{([\s\S]*?)\n {2}\}/);

  expect(thumb).not.toBeNull();
  // Полоса градиента шла от края до края и читалась как царапина.
  expect(thumb[1]).not.toContain('104deg');
  expect(bolt).not.toBeNull();
  // Тот же зигзаг, что и на большом превью.
  const shape = html.match(/\.mock-lightning\s*\{[\s\S]*?clip-path:\s*(polygon\([^;]*\));/);

  expect(shape).not.toBeNull();
  expect(bolt[1]).toContain(`clip-path: ${shape[1]};`);
  // Разряд держится в небе: верх кадра и выше линии горизонта в 59%.
  const top = Number.parseFloat(bolt[1].match(/top:\s*([\d.]+)%/)[1]);
  const height = Number.parseFloat(bolt[1].match(/height:\s*([\d.]+)%/)[1]);

  expect(top).toBeGreaterThan(0);
  expect(top + height).toBeLessThan(59);
});

test('047 выделен тёплым кадром среди зелёных соседей', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  // Строки 027, 043 и 047 шли подряд одинаково зелёными и в миниатюре
  // сливались в одно пятно.
  const base = (variant) => {
    const block = html.match(
      new RegExp(`\\n {2}\\.mock-thumb\\.${variant}\\s*\\{([\\s\\S]*?)\\n {2}\\}`),
    );

    const hex = block[1].match(/linear-gradient\([^)]*?(#[0-9a-f]{6})/i)[1];

    return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  };

  const [red, green, blue] = base('t7');

  expect(red).toBeGreaterThan(green);
  expect(red).toBeGreaterThan(blue);
  // Соседи остаются зелёными — перекрашен ровно один кадр.
  for (const variant of ['t2', 't6']) {
    const [r, g] = base(variant);

    expect(g).toBeGreaterThan(r);
  }
});

test('мокап масштабируется вместе с колонкой вплоть до самой узкой двухколоночной hero', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const unit = html.match(/\.mock\s*\{\s*--u:\s*clamp\(([^)]*)\)/);

  expect(unit).not.toBeNull();

  const [min] = unit[1].split(',').map((part) => part.trim());

  // Двухколоночная hero сужается примерно до 1000px ширины окна: там
  // 100cqi/620 ≈ .74px. Более высокий нижний порог перестаёт сжимать начинку
  // вместе с рамкой, и нижнее поле Metadata Preview срезается.
  expect(Number.parseFloat(min)).toBeLessThanOrEqual(0.74);
});

test('hero-мокап подгоняет шкалу, блок выбранных и целые строки под кадр', () => {
  const html = fs.readFileSync(landingPath, 'utf8');

  // Фиксированный nth-child больше не режет список — число строк считает fitMock.
  const narrow = [...html.matchAll(/@media \(max-width: 720px\)\s*\{([\s\S]*?)\n {2}\}/g)]
    .map(([, body]) => body)
    .find((body) => body.includes('.mock-preview { display: none; }'));

  expect(narrow).toBeDefined();
  expect(narrow).not.toMatch(/\.mock-row:nth-child\(n\+6\)/);

  // 1) Шаги без подписей, 2) футер выбранных скрыт, 3) только целые строки.
  expect(html).toMatch(/\.mock\.mock-steps-compact \.mock-steps > span:not\(\.mock-action\)/);
  expect(html).toMatch(/\.mock\.mock-foot-hidden \.mock-foot\s*\{\s*display:\s*none/);
  expect(html).toMatch(
    /\.mock\.mock-fitted \.mock-rows\s*\{[^}]*align-content:\s*space-evenly/s,
  );
  expect(html).toContain('new ResizeObserver(scheduleFit)');
  expect(html).toContain('mock-steps-compact');
  expect(html).toContain('mock-foot-hidden');
  expect(html).toContain('setVisibleRows');
  expect(html).toContain('footBlock');
  expect(html).toContain('align-content: space-evenly');
  // Выбранная строка — четвёртая: окно видимости сдвигается, чтобы она осталась.
  const rows = [...html.matchAll(/<div class="mock-row( on)?">/g)];
  expect(rows.findIndex(([, on]) => on)).toBe(3);
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

test('scroll-parallax мокапа не анимирует transform через CSS transition', () => {
  const html = fs.readFileSync(landingPath, 'utf8');
  const stage = html.match(/\n {2}\.mock-stage\s*\{([\s\S]*?)\n {2}\}/);

  expect(stage).not.toBeNull();
  // transition на transform + --py на каждом кадре скролла = рывки на таче.
  expect(stage[1]).not.toMatch(/transition:\s*transform/);
  // Плавный возврат tilt — только на pointerleave, не в базовом CSS.
  expect(html).toContain("stage.style.transition = TILT_EASE");
  expect(html).toContain("stage.style.setProperty('--py'");
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
