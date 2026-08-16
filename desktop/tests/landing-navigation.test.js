'use strict';

const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const indexPath = path.join(landingDir, 'index.html');

test.each(['index.html', 'screens.html'])(
  '%s uses a dark document canvas without cross-document transitions',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toMatch(/html\s*{[^}]*background:\s*var\(--bg\)/);
    expect(html).not.toContain('@view-transition');
    expect(html).not.toContain('::view-transition');
  }
);

// Якоря шапки должны указывать на существующие секции: иначе мобильная
// лента-навигация и desktop-меню ведут в никуда.
test('ссылки шапки ведут на существующие якоря разделов', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const nav = html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/);
  expect(nav).not.toBeNull();

  const hrefs = [...nav[0].matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
  expect(hrefs).toEqual(['#features', '#fields', '#how', '#screens', '#install']);

  for (const href of hrefs) {
    const id = href.slice(1);
    expect(html).toMatch(new RegExp(`id="${id}"`));
  }
});

test('брендовый якорь и hero-ссылка «Как это работает» указывают на существующие цели', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  expect(html).toMatch(/<a class="brand" href="#top">/);
  // #top должен быть у самого начала body (не на <main>): иначе
  // scroll-to-top останавливается под sticky-шапкой, а не у scrollY = 0.
  expect(html).toMatch(
    /<body>\s*(?:<!--[\s\S]*?-->\s*)*<span id="top"[^>]*>\s*<\/span>/
  );
  expect(html).not.toMatch(/<main\b[^>]*\bid="top"/);
  expect(html).toMatch(/class="btn btn-ghost" href="#how"/);
  expect(html).toMatch(/id="how"/);
});

// Повторный клик по логотипу при hash=#top: браузер якорь не крутит,
// mousedown только закрывает ирис — нужен явный scrollTo(0).
test('клик по логотипу всегда принудительно крутит наверх', () => {
  const html = fs.readFileSync(indexPath, 'utf8');

  expect(html).toContain('a.brand[href="#top"]');
  expect(html).toMatch(/brand\.addEventListener\('click'/);
  expect(html).toMatch(
    /scrollTo\(\{\s*top:\s*0,\s*behavior:\s*reduced \? ['"]auto['"] : ['"]smooth['"]\s*\}\)/
  );
  // Hash обновляем сами после preventDefault, иначе URL останется на разделе.
  expect(html).toMatch(/history\.pushState\(null,\s*['"]['"],\s*['"]#top['"]\)/);
});

// В шапке — голая метка как в приложении, без тёмной плитки icon.svg.
// Ход лепестков рисуют модули brand-iris/ (d у path), не CSS-трансформ svg.
test.each(['index.html', 'screens.html'])(
  '%s: логотип без плитки значка, двигается только затвор',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toMatch(
      /<span class="brand-logo"[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<svg class="brand-mark"/
    );
    expect(html).toMatch(
      /class="brand-mark"[^>]*viewBox="0 0 31\.875 31\.875"/
    );
    // Никакого CSS-rotate на метке.
    expect(html).not.toMatch(/\.brand-logo:hover \.brand-mark\s*{[^}]*transform:\s*rotate/);
    expect(html).not.toMatch(/\.brand:hover \.brand-mark/);
    // Нет подложки icon.svg в шапке.
    expect(html).not.toMatch(/\.brand-logo\s*{[^}]*#30303A/);
    expect(html).not.toMatch(/\.brand-logo\s*{[^}]*background:\s*linear-gradient/);
    expect(html).not.toMatch(/translate\(97\.6 97\.6\) scale\(26\)/);
    // Solid как в приложении, без градиента метки.
    expect(html).toMatch(/class="brand-blades"[^>]*fill="#9191F3"/);
    expect(html).not.toMatch(/brand-mark-fill|url\(#mark\)/);
    expect(html).not.toMatch(/\.brand:hover img\s*{/);
  }
);

// Hero-мок и OG (через build-og) показывают ту же UI-метку, не favicon-плитку.
test('мок на главной использует logo.svg без плитки', () => {
  const html = fs.readFileSync(indexPath, 'utf8');
  const mockHead = html.match(/<div class="mock-head">[\s\S]*?<\/div>/);

  expect(mockHead).not.toBeNull();
  expect(mockHead[0]).toMatch(/src="logo\.svg"/);
  expect(mockHead[0]).not.toMatch(/icon\.svg/);
});

// logo.svg — единственный файл метки: solid #9191F3, без rect-подложки.
test('logo.svg — solid-метка без плитки и градиента', () => {
  const logo = fs.readFileSync(path.join(landingDir, 'logo.svg'), 'utf8');

  expect(logo).toMatch(/fill="#9191F3"/);
  expect(logo).not.toMatch(/linearGradient|<rect\b|30303A|AAA8FF|7D7DEE/);
});

// Затвор оживляют модули brand-iris/: он подменяет d у метки, а разметка обязана
// дать ему точку опоры и остаться валидной без скрипта.
test.each(['index.html', 'screens.html'])(
  '%s: метка размечена под диафрагму и скрипт подключён',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toMatch(/<path class="brand-blades" d="M8\.32812/);
    // Ирис разнесён по модулям: геометрия, ход, handoff, присутствие, сборка.
    ['geometry', 'motion', 'handoff', 'presence', 'init'].forEach((name) => {
      expect(html).toMatch(
        new RegExp(`<script src="brand-iris/${name}\\.js(?:\\?[^"]*)?"></script>`)
      );
    });
    // Заливкой центр не закрывают: диафрагма всегда остаётся контурной.
    expect(html).not.toMatch(/brand-mark-iris/);
  }
);

// Надпись отзывается слоем .brand-name-lit, не сменой ширины/кегля:
// любая правка ширины сдвигала бы соседние пункты шапки.
test.each(['index.html', 'screens.html'])(
  '%s: wordmark подсвечивается слоем, не двигая соседей',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toContain('<span class="brand-name">Photo Metadata AI</span>');
    expect(html).toMatch(
      /<span class="brand-name-lit" aria-hidden="true">Photo Metadata AI<\/span>/
    );
    const lit = html.match(/\n  \.brand-name-lit \{([^}]*)\}/);
    expect(lit).not.toBeNull();
    expect(lit[1]).toMatch(/color:\s*#fff/);
    expect(lit[1]).toMatch(/opacity:\s*0/);
    expect(lit[1]).not.toMatch(/letter-spacing|font-size|padding|margin/);
  }
);

// prefers-reduced-motion гасит и ход затвора (через brand-iris/), и
// подсветку надписи.
test.each(['index.html', 'screens.html'])(
  '%s: анимация логотипа выключена при reduced motion',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');
    const reduced = html.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\n  }/
    );

    expect(reduced).not.toBeNull();
    expect(reduced[0]).toMatch(
      /\.brand-name-lit \{[^}]*opacity:\s*0[^}]*transition:\s*none/
    );
  }
);

// Ореол — слой с opacity. Цвет самой надписи не меняется: на iOS :hover
// без transition и color от var(--text) к #fff давали мигание.
test.each(['index.html', 'screens.html'])(
  '%s: ореол названия проявляется opacity-слоем, без смены color',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    const base = html.match(/\n  \.brand-name \{([^}]*)\}/);
    expect(base).not.toBeNull();
    expect(base[1]).toMatch(/color:\s*var\(--text\)/);
    expect(base[1]).not.toMatch(/animation:|transition:|filter:/);
    expect(base[1]).not.toMatch(/background-clip:\s*text/);

    const lit = html.match(/\n  \.brand-name-lit \{([^}]*)\}/);
    expect(lit).not.toBeNull();
    expect(lit[1]).toMatch(
      /filter:\s*drop-shadow\(0 0 3\.5px rgba\(139, 136, 248, \.55\)\)/
    );
    // На таче transition в CSS нет: iOS её пропускает, слой ведёт rAF.
    expect(lit[1]).not.toMatch(/transition:/);

    expect(html).not.toMatch(/\.brand\.is-lit \.brand-name-lit/);
    expect(html).toMatch(/-webkit-tap-highlight-color:\s*transparent/);

    // Наведение только у настоящей мыши — iOS не щёлкает слой через :hover.
    expect(html).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\.brand:hover:not\(\.is-tap\) \.brand-name-lit/
    );

    // Свечение шире кегля сливает ореолы соседних букв в сплошную плиту, а на
    // узкой ширине её срезает overflow: hidden у .brand-name — подсветка
    // читается как рамка. drop-shadow на слое, не на клипуемом тексте.
    const css = html.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.brand-name\s*{[^}]*text-shadow/);
    expect(lit[1]).not.toMatch(/text-shadow/);
  }
);

// AI-искры вокруг метки: узкий луч в акцентном цвете, мягкое дыхание,
// без перехвата кликов и без влияния на FLIP бренда.
test.each(['index.html', 'screens.html'])(
  '%s: в области бренда AI-искры с хаотичным блеском',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toMatch(
      /<a class="brand"[^>]*>\s*<span class="brand-lockup">\s*<span class="brand-sparkles" aria-hidden="true">/
    );
    expect(html).toMatch(
      /<span class="brand-sparkles" aria-hidden="true">[\s\S]*<span class="brand-logo"/
    );

    const lockup = html.match(/\n  \.brand-lockup \{([^}]*)\}/);
    expect(lockup).not.toBeNull();
    expect(lockup[1]).toMatch(/display:\s*inline-flex/);
    expect(lockup[1]).toMatch(/min-width:\s*0/);
    expect(lockup[1]).toMatch(/max-width:\s*100%/);
    expect((html.match(/class="brand-sparkle(?:\s|")/g) || []).length).toBe(16);
    expect(html).not.toMatch(/brand-sparkle-cluster/);

    const xs = [...html.matchAll(/--x:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    const ys = [...html.matchAll(/--y:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(xs.some((x) => x <= 8)).toBe(true);
    expect(xs.some((x) => x >= 12 && x <= 22)).toBe(true);
    expect(xs.some((x) => x >= 35 && x <= 75)).toBe(true);
    expect(Math.max(...xs)).toBeLessThanOrEqual(88);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(85);
    expect(ys.some((y) => y >= 28 && y <= 62)).toBe(true);

    const sizes = [...html.matchAll(/--sz:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(new Set(sizes)).toEqual(new Set([6, 8, 11]));

    // Один период у всех + перемешанные фазы: не волна слева направо, ≥6 сразу.
    const sparkleBlock = html.match(
      /<span class="brand-sparkles"[\s\S]*?<\/span>/
    )[0];
    const durs = [...sparkleBlock.matchAll(/--dur:\s*([\d.]+)s/g)].map((m) => Number(m[1]));
    expect(durs).toHaveLength(16);
    expect(durs.every((d) => d === 5)).toBe(true);

    const pairs = [...sparkleBlock.matchAll(/--x:\s*([\d.]+)%[^>]*--delay:\s*(-?[\d.]+)s/g)].map(
      (m) => ({ x: Number(m[1]), delay: Number(m[2]) })
    );
    expect(pairs).toHaveLength(16);
    const delaysByX = pairs.sort((a, b) => a.x - b.x).map((p) => p.delay);
    const sortedDelays = [...delaysByX].sort((a, b) => a - b);
    expect(delaysByX).not.toEqual(sortedDelays);

    const layer = html.match(/\.brand-sparkles\s*{([^}]*)}/);
    expect(layer).not.toBeNull();
    expect(layer[1]).toMatch(/pointer-events:\s*none/);
    expect(layer[1]).toMatch(/position:\s*absolute/);
    expect(layer[1]).toMatch(/top:\s*-8px/);
    expect(layer[1]).toMatch(/right:\s*-20px/);
    expect(layer[1]).toMatch(/bottom:\s*-8px/);
    expect(layer[1]).toMatch(/left:\s*-16px/);
    expect(layer[1]).toMatch(/z-index:\s*1/);
    // Без анимации top/bottom: иначе после intro рамка сжимает искры.
    expect(layer[1]).not.toMatch(/\n\s*transition\s*:/);
    expect(html).toMatch(
      /\.brand-sparkles\.is-intro-zone\s*\{[^}]*--spark-intro-top[^}]*--spark-intro-bottom[^}]*clip-path:\s*polygon/
    );

    // Ниже полосы шапки бока отрезаны вертикально: на высоте сужения стоит
    // вторая точка с тем же y, иначе край уходил бы диагональю.
    const introZone = html.match(/\.brand-sparkles\.is-intro-zone\s*\{([^}]*)\}/)[1];
    expect(introZone).toMatch(
      /100% var\(--spark-intro-band, 80%\),\s*calc\(100% - var\(--spark-intro-side, 22%\)\) var\(--spark-intro-band, 80%\)/
    );
    expect(introZone).toMatch(
      /var\(--spark-intro-side, 22%\) var\(--spark-intro-band, 80%\),\s*0 var\(--spark-intro-band, 80%\)/
    );

    // Сама искра — только габарит, фаза и свечение: серебряного металлика на
    // ней нет, а маска ушла на ::before, иначе она обрезала бы спутника.
    const star = html.match(/\n  \.brand-sparkle \{([^}]*)\}/);
    expect(star).not.toBeNull();
    expect(star[1]).not.toMatch(/#c8c8d2|#8a8a96|mask/);
    expect(star[1]).toMatch(/drop-shadow\(0 0 3px rgba\(139, 136, 248/);
    expect(star[1]).toMatch(/animation:[^;]*brand-sparkle-glint var\(--dur,\s*5s\)/);

    const ray = html.match(/\n  \.brand-sparkle::before,\n  \.brand-sparkle::after \{([^}]*)\}/);
    expect(ray).not.toBeNull();
    expect(ray[1]).toMatch(/#9b98fb/);
    expect(ray[1]).toMatch(/#8fd9ff/);
    expect(html).toMatch(
      /\.brand-sparkle::before\s*\{[^}]*inset:\s*0[^}]*animation:\s*brand-sparkle-form/
    );
    // Луч узкий: горизонтальные концы поджаты к центру, симметрии снежинки нет.
    expect(ray[1]).toMatch(/d='M12 0C[^']*20\.4 12/);
    expect(ray[1]).not.toMatch(/16\.65 11\.55 24 12/);

    // Спутник — явный класс; среди 16 их ровно 5.
    const mate = html.match(/\n  \.brand-sparkle-pair::after \{([^}]*)\}/);
    expect(mate).not.toBeNull();
    expect(mate[1]).toMatch(/width:\s*46%/);
    expect(mate[1]).toMatch(/height:\s*46%/);
    expect(mate[1]).toMatch(/#8fd9ff/);
    expect(mate[1]).toMatch(/drop-shadow\(0 0 4px rgba\(121, 212, 255/);

    // Только парные знаки дают мягкую волну обработки; основной glint при
    // этом остаётся первым animation-name, поэтому JS перезапускает оба слоя.
    const signal = html.match(
      /\n  \.brand-sparkle-pair \{([^}]*)\}/
    );
    expect(signal).not.toBeNull();
    expect(signal[1]).toMatch(/animation-name:\s*brand-sparkle-glint,\s*brand-sparkle-signal/);
    expect(html).toMatch(/@keyframes brand-sparkle-signal/);
    expect(html).toMatch(/box-shadow:\s*0 0 0 6px rgba\(155, 152, 251, 0\)/);
    expect(html).toMatch(/@keyframes brand-sparkle-form/);
    expect(html).toMatch(/@keyframes brand-sparkle-companion/);
    expect(html).toMatch(/clip-path:\s*inset\(46% 42%\)/);
    expect(html).toMatch(/\.brand-sparkle\.is-restarting::before/);

    // Среди 16: 5 одиночных, 5 парных, 6 триад (2↑ + dur + dul + hr + hl).
    const sparkleTags = html.match(/<i class="brand-sparkle(?: [^"]*)?"/g) || [];
    expect(sparkleTags).toHaveLength(16);
    expect((html.match(/class="brand-sparkle brand-sparkle-pair"/g) || [])).toHaveLength(5);
    expect((html.match(/class="brand-sparkle brand-sparkle-triad"/g) || [])).toHaveLength(2);
    expect(
      (html.match(/class="brand-sparkle brand-sparkle-triad brand-sparkle-triad-dur"/g) || [])
    ).toHaveLength(1);
    expect(
      (html.match(/class="brand-sparkle brand-sparkle-triad brand-sparkle-triad-dul"/g) || [])
    ).toHaveLength(1);
    expect(
      (html.match(/class="brand-sparkle brand-sparkle-triad brand-sparkle-triad-hr"/g) || [])
    ).toHaveLength(1);
    expect(
      (html.match(/class="brand-sparkle brand-sparkle-triad brand-sparkle-triad-hl"/g) || [])
    ).toHaveLength(1);
    expect(
      sparkleTags.filter((tag) => !tag.includes('pair') && !tag.includes('triad'))
    ).toHaveLength(5);
    expect((html.match(/brand-sparkle-step-2/g) || []).length).toBeGreaterThanOrEqual(7);
    expect((html.match(/brand-sparkle-step-3/g) || []).length).toBeGreaterThanOrEqual(7);
    expect(html).toMatch(
      /\.brand-sparkle-step-2\s*\{[^}]*left:\s*19%[^}]*top:\s*-72%[^}]*width:\s*62%[^}]*brand-sparkle-chain-2/
    );
    expect(html).toMatch(
      /\.brand-sparkle-step-3\s*\{[^}]*left:\s*31%[^}]*top:\s*-118%[^}]*width:\s*38%[^}]*brand-sparkle-chain-3/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-dur \.brand-sparkle-step-2\s*\{[^}]*left:\s*78%[^}]*top:\s*-72%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-dur \.brand-sparkle-step-3\s*\{[^}]*left:\s*128%[^}]*top:\s*-118%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-dul \.brand-sparkle-step-2\s*\{[^}]*left:\s*-40%[^}]*top:\s*-72%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-dul \.brand-sparkle-step-3\s*\{[^}]*left:\s*-66%[^}]*top:\s*-118%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-hr \.brand-sparkle-step-2\s*\{[^}]*left:\s*108%[^}]*top:\s*19%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-hr \.brand-sparkle-step-3\s*\{[^}]*left:\s*180%[^}]*top:\s*31%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-hl \.brand-sparkle-step-2\s*\{[^}]*left:\s*-70%[^}]*top:\s*19%/
    );
    expect(html).toMatch(
      /\.brand-sparkle-triad-hl \.brand-sparkle-step-3\s*\{[^}]*left:\s*-118%[^}]*top:\s*31%/
    );
    expect(html).toMatch(/@keyframes brand-sparkle-chain-2\s*\{[\s\S]*?17%[\s\S]*?28%/);
    expect(html).toMatch(/@keyframes brand-sparkle-chain-3\s*\{[\s\S]*?28%[\s\S]*?39%/);
    expect(html).toMatch(/\.brand-sparkle\.is-restarting \.brand-sparkle-step/);

    const glint = html.match(/@keyframes brand-sparkle-glint \{([\s\S]*?)\n  \}/);
    expect(glint).not.toBeNull();
    // Мягкое дыхание на месте: без щелчка, доворота и бега градиента.
    expect(glint[1]).toMatch(/scale\(1\.04\)/);
    expect(glint[1]).not.toMatch(/scale\(1\.1[5-9]\)|scale\(1\.[2-9]/);
    expect(glint[1]).not.toMatch(/calc\(var\(--rot/);
    expect(glint[1]).not.toMatch(/background-position/);
    expect(glint[1]).toMatch(/drop-shadow\(0 0 14px/);
    // ~54% огибающей → при 16 фазах ровно ≥6, тёмная фаза совпадает с JS.
    expect(glint[1]).toMatch(/54%,\s*100%\s*\{[^}]*opacity:\s*0/);
    expect(html).toMatch(/\.brand-sparkles\.is-intro/);
    expect(html).not.toMatch(/@keyframes brand-sparkle-intro-in/);
    expect(html).not.toMatch(/\.brand-sparkle-rain/);
    expect(html).not.toMatch(/is-loop-enter/);

    const reduced = html.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\n  }/
    );
    expect(reduced).not.toBeNull();
    expect(reduced[0]).toMatch(/\.brand-sparkles\s*{[^}]*display:\s*none/);
  }
);

test('screens.html: «На главную» — крайняя правая кнопка шапки', () => {
  const html = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');
  const nav = html.match(/<div class="wrap nav">([\s\S]*?)<\/div>\s*<\/header>/);
  expect(nav).not.toBeNull();

  const downloadAt = nav[1].indexOf('/releases/download/');
  const homeAt = nav[1].indexOf('class="btn nav-home"');
  expect(downloadAt).toBeGreaterThanOrEqual(0);
  expect(homeAt).toBeGreaterThan(downloadAt);
  expect((nav[1].slice(homeAt).match(/class="btn[^"]*"/g) || [])).toHaveLength(1);
});

test('обе страницы рандомизируют позиции; intro — только когда есть hero badge', () => {
  const indexHtml = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
  const screensHtml = fs.readFileSync(path.join(landingDir, 'screens.html'), 'utf8');
  const sparklesJs = fs.readFileSync(path.join(landingDir, 'brand-sparkles.js'), 'utf8');

  expect(indexHtml).toMatch(/<script src="brand-sparkles\.js(?:\?[^"]*)?"><\/script>/);
  expect(indexHtml).toMatch(/macOS 11\+\s*·\s*Apple Silicon/);
  expect(screensHtml).toMatch(/<script src="brand-sparkles\.js(?:\?[^"]*)?"><\/script>/);
  expect(sparklesJs).toMatch(/brandSparklesWhenBrandVisible/);
  expect(sparklesJs).toMatch(/header-swap-ready/);
  expect(sparklesJs).toMatch(/brandSparklesStartWorkingLoop/);
  expect(sparklesJs).toMatch(/animationiteration/);
  expect(sparklesJs).toMatch(/BRAND_SPARKLES_DARK_AT_MS/);
  expect(sparklesJs).toMatch(/BRAND_SPARKLES_EXTRA_COUNT\s*=\s*4/);
  expect(sparklesJs).toMatch(/brandSparklesCreateExtras/);
  expect(sparklesJs).toMatch(/ENABLE_BRAND_SPARKLES/);
  expect(sparklesJs).toMatch(/brandSparklesEnabled/);
  expect(sparklesJs).not.toMatch(/brandSparklesFallOne|brand-sparkle-rain|is-loop-enter/);
});
