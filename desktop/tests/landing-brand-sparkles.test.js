'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const {
  initBrandSparkles,
  brandSparklesIsSwapArrival,
  brandSparklesReduced,
  brandSparklesMobile,
  brandSparklesMobileDelay,
  brandSparklesIntersectsRect,
  brandSparklesMobilePoint,
  brandSparklesEnabled,
  brandSparklesPageKey,
  brandSparklesWhenBrandVisible,
  brandSparklesLayout,
  brandSparklesCreateIntroFlow,
  brandSparklesCreateWorkingFlow,
  brandSparklesIntroOrder,
  brandSparklesZoneAspect,
  brandSparklesZoneBox,
  brandSparklesCollapseZone,
  brandSparklesFitIntroZone,
  brandSparklesRedistributeHidden,
  brandSparklesStartWorkingLoop,
  brandSparklesWorkingState,
  brandSparklesModes,
  brandSparklesResolveMode,
  brandSparklesRegisterIntroMode,
  brandSparklesRegisterWorkingMode,
  BRAND_SPARKLES_INTRO_MODES,
  BRAND_SPARKLES_WORKING_MODES,
} = require(path.join(landingDir, 'brand-sparkles.js'));

const flagsSandbox = {};
vm.runInNewContext(
  fs.readFileSync(path.join(landingDir, 'ambient-particle-flags.js'), 'utf8'),
  flagsSandbox
);
const { getLandingParticleFlags, normalizeBrandSparklesMode } = flagsSandbox;

function fakeSparkleStage({
  reduced = false,
  touch = false,
  headerSwap = false,
  withBadge = true,
  starCount = 3,
  sparklesEnabled = true,
  introMode = 'flow',
  workingMode = 'flow',
  useConfiguredModes = false,
  pagePath = '/landing/index.html',
  randomSeq = [0.5, 0.4, 0.6, 0.45, 0.55, 0.5, 0.48, 0.52],
} = {}) {
  const layerClasses = new Set();
  let randI = 0;
  const makeStar = (i) => {
    const classSet = new Set();
    const attrs = new Map();
    const listeners = {};
    const style = {
      _props: new Map([
        ['--x', `${10 + i * 20}%`],
        ['--rot', '0deg'],
        ['--delay', `${(-i * 0.3).toFixed(2)}s`],
      ]),
      setProperty(name, value) {
        this._props.set(name, value);
      },
      getPropertyValue(name) {
        return this._props.get(name) || '';
      },
      removeProperty(name) {
        this._props.delete(name);
      },
      animation: '',
      opacity: '',
      transform: '',
      transition: '',
      left: '',
      top: '',
      width: '',
      height: '',
      position: '',
      margin: '',
      zIndex: '',
    };
    return {
      style,
      offsetWidth: 8,
      className: '',
      parentNode: null,
      children: [],
      setAttribute(name, value) {
        attrs.set(name, value);
      },
      getAttribute(name) {
        return attrs.get(name);
      },
      appendChild(node) {
        this.children.push(node);
        node.parentNode = this;
        return node;
      },
      addEventListener(name, handler) {
        (listeners[name] = listeners[name] || []).push(handler);
      },
      removeEventListener(name, handler) {
        listeners[name] = (listeners[name] || []).filter((h) => h !== handler);
      },
      dispatch(name, event) {
        (listeners[name] || []).slice().forEach((handler) => handler(event));
      },
      classList: {
        add: (...names) => names.forEach((n) => classSet.add(n)),
        remove: (...names) => names.forEach((n) => classSet.delete(n)),
        contains: (name) => classSet.has(name),
      },
      getBoundingClientRect: () => ({
        left: 20 + i * 12,
        top: 18,
        width: 8,
        height: 8,
        right: 28 + i * 12,
        bottom: 26,
      }),
      cloneNode() {
        return {
          classList: { add() {} },
          style: {
            animation: '',
            opacity: '',
            transform: '',
            transition: '',
            left: '',
            top: '',
            width: '',
            height: '',
            position: '',
            margin: '',
            zIndex: '',
          },
        };
      },
    };
  };

  const stars = Array.from({ length: starCount }, (_, i) => makeStar(i));
  const extraStars = [];
  let layerRemoved = false;
  const layerStyle = {
    _props: new Map(),
    setProperty(name, value) {
      this._props.set(name, value);
    },
    getPropertyValue(name) {
      return this._props.get(name) || '';
    },
    removeProperty(name) {
      this._props.delete(name);
    },
  };
  const lockup = {
    getBoundingClientRect: () => ({
      left: 24,
      top: 17,
      width: 220,
      height: 30,
      right: 244,
      bottom: 47,
    }),
  };
  const header = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 1440,
      height: 64,
      right: 1440,
      bottom: 64,
    }),
  };

  const layer = {
    classList: {
      add: (...names) => names.forEach((n) => layerClasses.add(n)),
      remove: (...names) => names.forEach((n) => layerClasses.delete(n)),
      contains: (name) => layerClasses.has(name),
    },
    style: layerStyle,
    parentElement: lockup,
    parentNode: lockup,
    querySelectorAll: (sel) => (sel === '.brand-sparkle' ? stars.concat(extraStars) : []),
    appendChild(node) {
      node.parentNode = layer;
      extraStars.push(node);
    },
    removeChild(node) {
      const at = extraStars.indexOf(node);
      if (at >= 0) extraStars.splice(at, 1);
      node.parentNode = null;
    },
    remove() {
      layerRemoved = true;
      layer.parentNode = null;
      layer.parentElement = null;
    },
    // Рабочая зона искр: локап, расширенный инсетами .brand-sparkles
    // (слева 16, справа 20, сверху и снизу 8).
    getBoundingClientRect: () => ({
      left: 0,
      top: 9,
      width: 217,
      height: 46,
      right: 217,
      bottom: 55,
    }),
    offsetWidth: 180,
  };

  const badge = withBadge
    ? {
        getBoundingClientRect: () => ({
          left: 40,
          top: 140,
          width: 160,
          height: 22,
          right: 200,
          bottom: 162,
        }),
      }
    : null;

  const appended = [];
  const removed = [];
  const rootClasses = new Set(headerSwap ? ['header-swap'] : []);
  const moCallbacks = [];
  let timers = [];
  let nextTimer = 1;
  let rafQueue = [];
  let nextRaf = 1;
  let now = 0;

  const win = {
    now: 0,
    innerWidth: touch ? 390 : 1440,
    location: { pathname: pagePath },
    getLandingParticleFlags(pageKey) {
      const flags = getLandingParticleFlags(pageKey);
      const next = Object.assign({}, flags, { ENABLE_BRAND_SPARKLES: sparklesEnabled });
      if (!useConfiguredModes) {
        next.BRAND_SPARKLES_INTRO = introMode;
        next.BRAND_SPARKLES_WORKING = workingMode;
      }
      return next;
    },
    performance: { now: () => now },
    Math: {
      random: () => {
        const v = randomSeq[randI % randomSeq.length];
        randI += 1;
        return v;
      },
    },
    matchMedia: (query = '') => ({
      matches: /pointer: coarse|hover: none/.test(query) ? touch : reduced,
    }),
    getComputedStyle: (star) => ({
      opacity: star === stars[0] || star === stars[1] ? '0' : '0.7',
    }),
    MutationObserver: function (cb) {
      moCallbacks.push(cb);
      return { observe() {}, disconnect() {} };
    },
    requestAnimationFrame(cb) {
      const id = nextRaf++;
      rafQueue.push({ id, cb });
      return id;
    },
    setTimeout(cb, ms) {
      const id = nextTimer++;
      timers.push({ id, at: now + ms, cb });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((t) => t.id !== id);
    },
  };

  const doc = {
    documentElement: {
      classList: {
        contains: (name) => rootClasses.has(name),
        add: (...names) => names.forEach((n) => rootClasses.add(n)),
        remove: (...names) => names.forEach((n) => rootClasses.delete(n)),
      },
    },
    querySelector: (sel) => {
      if (sel === '.brand-sparkles') return layerRemoved ? null : layer;
      if (sel === '.hero-copy > .badge') return badge;
      if (sel === 'header') return header;
      if (sel === '.brand-logo') {
        return {
          getBoundingClientRect: () => ({
            left: 16,
            top: 17,
            width: 30,
            height: 30,
            right: 46,
            bottom: 47,
          }),
        };
      }
      if (sel === '.brand-wordmark') {
        return {
          getBoundingClientRect: () => ({
            left: 57,
            top: 19,
            width: 140,
            height: 26,
            right: 197,
            bottom: 45,
          }),
        };
      }
      if (sel === '.nav-toggle') {
        return {
          getBoundingClientRect: () => ({
            left: 332,
            top: 11,
            width: 42,
            height: 42,
            right: 374,
            bottom: 53,
          }),
        };
      }
      return null;
    },
    createElement: () => makeStar(stars.length + extraStars.length),
    body: {
      appendChild(node) {
        node.parentNode = this;
        appended.push(node);
      },
      removeChild(node) {
        removed.push(node);
        node.parentNode = null;
      },
    },
  };

  function flushRaf() {
    const batch = rafQueue.splice(0);
    batch.forEach((item) => item.cb(now));
  }

  function advance(ms) {
    const target = now + ms;
    while (timers.some((t) => t.at <= target)) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at);
      const next = due[0];
      timers = timers.filter((t) => t.id !== next.id);
      now = next.at;
      win.now = now;
      next.cb();
      flushRaf();
      flushRaf();
    }
    now = target;
    win.now = now;
  }

  function triggerMo() {
    moCallbacks.slice().forEach((cb) => cb());
  }

  return {
    doc,
    win,
    layer,
    layerClasses,
    layerRemoved: () => layerRemoved,
    rootClasses,
    stars,
    extraStars,
    appended,
    removed,
    flushRaf,
    advance,
    triggerMo,
  };
}

test('brandSparklesIsSwapArrival / reduced', () => {
  expect(
    brandSparklesIsSwapArrival({
      documentElement: { classList: { contains: (n) => n === 'header-swap' } },
    })
  ).toBe(true);
  expect(brandSparklesReduced({ matchMedia: () => ({ matches: true }) })).toBe(true);
});

test('ENABLE_BRAND_SPARKLES рядом с флагами частицы, отдельно для index/screens', () => {
  const index = getLandingParticleFlags('index');
  const screens = getLandingParticleFlags('screens');
  expect(index).toHaveProperty('ENABLE_BRAND_SPARKLES');
  expect(screens).toHaveProperty('ENABLE_BRAND_SPARKLES');
  expect(typeof index.ENABLE_BRAND_SPARKLES).toBe('boolean');
  expect(typeof screens.ENABLE_BRAND_SPARKLES).toBe('boolean');
  expect(index.BRAND_SPARKLES_INTRO).toBe(false);
  expect(index.BRAND_SPARKLES_WORKING).toBe('twinkle-pairs');
  expect(screens.BRAND_SPARKLES_INTRO).toBe(false);
  expect(screens.BRAND_SPARKLES_WORKING).toBe('twinkle-pairs');
  expect(brandSparklesPageKey({ location: { pathname: '/landing/screens.html' } })).toBe(
    'screens'
  );
  expect(brandSparklesPageKey({ location: { pathname: '/landing/index.html' } })).toBe('index');
});

test('normalizeBrandSparklesMode: false/none выключают, true → flow', () => {
  expect(normalizeBrandSparklesMode(false)).toBe(false);
  expect(normalizeBrandSparklesMode('none')).toBe(false);
  expect(normalizeBrandSparklesMode('')).toBe(false);
  expect(normalizeBrandSparklesMode(null)).toBe(false);
  expect(normalizeBrandSparklesMode(true)).toBe('flow');
  expect(normalizeBrandSparklesMode('flow')).toBe('flow');
  expect(normalizeBrandSparklesMode('bloom')).toBe('bloom');
});

test('реестр режимов: неизвестный id выключает, новый id регистрируется', () => {
  expect(brandSparklesResolveMode('flow', BRAND_SPARKLES_INTRO_MODES)).toBe('flow');
  expect(brandSparklesResolveMode(false, BRAND_SPARKLES_INTRO_MODES)).toBe(null);
  expect(brandSparklesResolveMode('nope', BRAND_SPARKLES_INTRO_MODES)).toBe(null);

  let called = 0;
  expect(
    brandSparklesRegisterIntroMode('test-intro', () => {
      called += 1;
    })
  ).toBe(true);
  expect(brandSparklesResolveMode('test-intro', BRAND_SPARKLES_INTRO_MODES)).toBe('test-intro');
  BRAND_SPARKLES_INTRO_MODES['test-intro'](null, null, null, {});
  expect(called).toBe(1);
  delete BRAND_SPARKLES_INTRO_MODES['test-intro'];

  expect(
    brandSparklesRegisterWorkingMode('test-work', () => {
      called += 1;
    })
  ).toBe(true);
  expect(brandSparklesResolveMode('test-work', BRAND_SPARKLES_WORKING_MODES)).toBe('test-work');
  delete BRAND_SPARKLES_WORKING_MODES['test-work'];
});

test('флаги режимов: intro off → сразу рабочий цикл', () => {
  const stage = fakeSparkleStage({
    starCount: 16,
    introMode: false,
    workingMode: 'flow',
  });
  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerClasses.has('is-intro')).toBe(false);
  expect(stage.layerClasses.has('is-intro-zone')).toBe(false);
  // Рабочий цикл расставляет --delay по порядку потока.
  const delays = stage.stars.map((star) => star.style.getPropertyValue('--delay'));
  expect(new Set(delays).size).toBe(16);
});

test('флаги режимов: working off → intro без handoff в цикл', () => {
  const stage = fakeSparkleStage({
    starCount: 16,
    introMode: 'flow',
    workingMode: false,
  });
  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerClasses.has('is-intro')).toBe(true);
  stage.flushRaf();
  // Без рабочего цикла extras не создаём.
  expect(stage.extraStars.length).toBe(0);
  expect(stage.layer._brandSparklesWorkingState).toBeUndefined();

  // После тёмной фазы первой волны искры замирают, а не уходят в цикл.
  stage.advance(2750);
  expect(stage.stars.some((star) => star.style.animation === 'none')).toBe(true);
});

test('флаги режимов: оба off → раскладка без анимации', () => {
  const stage = fakeSparkleStage({
    starCount: 8,
    introMode: false,
    workingMode: false,
  });
  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerClasses.has('is-intro')).toBe(false);
  expect(stage.stars.every((star) => star.getAttribute('data-spark-cell') != null)).toBe(true);
  expect(stage.stars.every((star) => star.style.animation === 'none')).toBe(true);
  expect(stage.stars.every((star) => star.style.opacity === '0')).toBe(true);
});

test('brandSparklesModes читает флаги страницы', () => {
  const indexStage = fakeSparkleStage({
    pagePath: '/landing/index.html',
    useConfiguredModes: true,
  });
  expect(brandSparklesModes(indexStage.doc, indexStage.win)).toEqual({
    intro: null,
    working: 'twinkle-pairs',
  });
  const screensStage = fakeSparkleStage({
    withBadge: false,
    pagePath: '/landing/screens.html',
    useConfiguredModes: true,
  });
  expect(brandSparklesModes(screensStage.doc, screensStage.win)).toEqual({
    intro: null,
    working: 'twinkle-pairs',
  });
});

test('флаг false убирает слой искр и не запускает intro', () => {
  const stage = fakeSparkleStage({ sparklesEnabled: false });
  expect(brandSparklesEnabled(stage.doc, stage.win)).toBe(false);
  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerRemoved()).toBe(true);
  expect(stage.layerClasses.has('is-intro')).toBe(false);
  expect(stage.stars.every((star) => star.getAttribute('data-spark-cell') == null)).toBe(true);
});

test('layout даёт по одной случайной точке в каждой ячейке 4×4', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  const cells = brandSparklesLayout(stage.layer, stage.win);

  expect(new Set(cells).size).toBe(16);
  stage.stars.forEach((star) => {
    // Наклон небольшой: искра остаётся знаком AI, а не повёрнутым кристаллом.
    const rot = Number(star.style.getPropertyValue('--rot').replace('deg', ''));
    expect(Math.abs(rot)).toBeLessThanOrEqual(12);
    const cell = Number(star.getAttribute('data-spark-cell'));
    const x = Number(star.style.getPropertyValue('--x').replace('%', ''));
    const y = Number(star.style.getPropertyValue('--y').replace('%', ''));
    const col = cell % 4;
    const row = Math.floor(cell / 4);
    expect(x).toBeGreaterThan(col * 25);
    expect(x).toBeLessThan((col + 1) * 25);
    expect(y).toBeGreaterThan(row * 25);
    expect(y).toBeLessThan((row + 1) * 25);
  });
});

test('intro выбирает разные направления, но сохраняет единый порядок потока', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  brandSparklesLayout(stage.layer, stage.win);
  const makeWin = (values) => {
    let i = 0;
    return { Math: { random: () => values[i++ % values.length] } };
  };
  const leftFlow = brandSparklesCreateIntroFlow(makeWin([0.8, 0.01, 0.5, 0.5]));
  const rightFlow = brandSparklesCreateIntroFlow(makeWin([0.8, 0.2, 0.5, 0.5]));
  const cornerFlow = brandSparklesCreateIntroFlow(makeWin([0.8, 0.55, 0.1, 0.2, 0.3, 0.4]));
  const bloomFlow = brandSparklesCreateIntroFlow(makeWin([0.1, 0.2, 0.8]));
  const leftOrder = brandSparklesIntroOrder(stage.stars, leftFlow);
  const rightOrder = brandSparklesIntroOrder(stage.stars, rightFlow);
  const bloomOrder = brandSparklesIntroOrder(stage.stars, bloomFlow);

  expect(leftFlow).toMatchObject({ mode: 'sweep', edge: 0, sourceX: -12 });
  expect(rightFlow).toMatchObject({ mode: 'sweep', edge: 1, sourceX: 112 });
  // Угол СЗ: generative bloom из угла или соседней границы — AI-раскрытие,
  // без прохода к противоположному углу.
  expect(cornerFlow).toMatchObject({ mode: 'bloom', edge: 4 });
  expect(cornerFlow.sourceX).toBeLessThan(30);
  expect(cornerFlow.sourceY).toBeLessThan(30);
  expect(cornerFlow.targetX).toBeUndefined();
  expect(cornerFlow.targetY).toBeUndefined();
  expect(bloomFlow).toMatchObject({ mode: 'bloom', sourceX: 20, sourceY: 80 });
  expect(new Set(leftOrder).size).toBe(16);
  expect(new Set(rightOrder).size).toBe(16);
  expect(new Set(bloomOrder).size).toBe(16);
  expect(leftOrder).not.toEqual(rightOrder);
  expect(leftOrder).not.toEqual(bloomOrder);

  const xAtRank = (order, rank) => {
    const index = order.indexOf(rank);
    return Number(stage.stars[index].style.getPropertyValue('--x').replace('%', ''));
  };
  expect(xAtRank(leftOrder, 0)).toBeLessThan(xAtRank(leftOrder, 15));
  expect(xAtRank(rightOrder, 0)).toBeGreaterThan(xAtRank(rightOrder, 15));
});

test('рабочий поток в начале 50/50: без бокового маятника', () => {
  const makeWin = (values) => {
    let i = 0;
    return { Math: { random: () => values[i++ % values.length] } };
  };
  const bloom = brandSparklesCreateWorkingFlow(makeWin([0.1, 0.4, 0.6]));
  expect(bloom).toMatchObject({ mode: 'bloom', sourceX: 40, sourceY: 60 });
  expect(bloom.sourceX).toBeGreaterThanOrEqual(0);
  expect(bloom.sourceX).toBeLessThanOrEqual(100);

  // Рабочий периметр: верх, низ и углы — без слева/справа, иначе маятник.
  const edges = new Set();
  const kinds = [2, 3, 4, 5, 6, 7];
  kinds.forEach((_, i) => {
    const flow = brandSparklesCreateWorkingFlow(
      makeWin([0.7, (i + 0.1) / kinds.length, 0.1, 0.2, 0.3, 0.4])
    );
    expect([0, 1]).not.toContain(flow.edge);
    if (flow.edge >= 4) {
      expect(flow.mode).toBe('bloom');
      expect(flow.targetX).toBeUndefined();
    } else {
      expect(flow.mode).toBe('sweep');
    }
    edges.add(flow.edge);
  });
  expect(edges).toEqual(new Set(kinds));

  // Угол: AI-bloom либо в самом углу, либо на одной из соседних границ.
  const cornerExact = brandSparklesCreateWorkingFlow(makeWin([0.7, 0.35, 0.1, 0.2]));
  const cornerOnTop = brandSparklesCreateWorkingFlow(makeWin([0.7, 0.35, 0.5, 0.2]));
  const cornerOnLeft = brandSparklesCreateWorkingFlow(makeWin([0.7, 0.35, 0.9, 0.2]));
  expect(cornerExact).toMatchObject({ mode: 'bloom', edge: 4, sourceX: -12, sourceY: -12 });
  expect(cornerOnTop).toMatchObject({ mode: 'bloom', edge: 4, sourceY: -12 });
  expect(cornerOnTop.sourceX).toBeGreaterThan(-12);
  expect(cornerOnLeft).toMatchObject({ mode: 'bloom', edge: 4, sourceX: -12 });
  expect(cornerOnLeft.sourceY).toBeGreaterThan(-12);

  let interior = 0;
  let perimeter = 0;
  for (let i = 0; i < 10; i += 1) {
    const flow = brandSparklesCreateWorkingFlow({
      Math: { random: () => (i + 0.1) / 10 },
    });
    expect([0, 1]).not.toContain(flow.edge);
    if (flow.mode === 'bloom' && !Number.isFinite(flow.edge)) interior += 1;
    else perimeter += 1;
  }
  expect(interior).toBe(5);
  expect(perimeter).toBe(5);
});

test('последующие рабочие flow не повторяют курс подряд', () => {
  const makeWin = (values) => {
    let i = 0;
    return { Math: { random: () => values[i++ % values.length] } };
  };
  const bloom = brandSparklesCreateWorkingFlow(makeWin([0.1, 0.4, 0.6]));
  const top = brandSparklesCreateWorkingFlow(makeWin([0.7, 0.05, 0.4, 0.6]));
  expect(bloom.mode).toBe('bloom');
  expect(top).toMatchObject({ mode: 'sweep', edge: 2 });

  const afterTop = brandSparklesCreateWorkingFlow(makeWin([0.1, 0.4, 0.6]), top);
  const afterBloom = brandSparklesCreateWorkingFlow(makeWin([0.01, 0.4, 0.6]), bloom);
  expect(afterTop.mode).toBe('bloom');
  expect(afterBloom.mode).toBe('sweep');
  expect(afterBloom.edge).not.toBeUndefined();
});

test('рабочий режим продолжает маршрут intro без паузы', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  initBrandSparkles(stage.doc, stage.win);
  const state = stage.layer._brandSparklesWorkingState;
  stage.flushRaf();

  // Рабочий поток берёт маршрут intro, только ранги считает под свою зону.
  expect(state.order).toEqual(brandSparklesIntroOrder(stage.stars, state.flow, state.aspect));
  expect(new Set(state.order).size).toBe(16);
  expect(state.aspect).toBeCloseTo(46 / 256, 4);

  // Первая рабочая вспышка начинается раньше, чем гаснет последняя из intro,
  // поэтому между режимами нет пустого промежутка.
  const introDelays = stage.stars.map((star) =>
    Number(star.style.getPropertyValue('--delay').replace('ms', ''))
  );
  // Intro тянется достаточно долго, чтобы flow читался как процесс, а не пачка.
  expect(Math.max(...introDelays)).toBe(3200);
  expect(new Set(introDelays).size).toBe(16);
  const starts = collectFlashStarts(stage, 9000);
  const working = starts.filter((s) => s >= VISIBLE_MS);
  expect(Math.min(...working)).toBeLessThan(VISIBLE_MS + Math.max(...introDelays));
  expect(Math.max(...working) - Math.min(...working)).toBeGreaterThan(3000);
});

test('ранги считаются в пропорциях своей зоны: intro выше рабочей', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  brandSparklesLayout(stage.layer, stage.win);

  // Ширина зоны = 220 + 16 + 20, высота рабочей = 30 + 8 + 8,
  // высота intro = шапка 64 + выход 16.
  const workAspect = brandSparklesZoneAspect(stage.layer, stage.doc, false);
  const introAspect = brandSparklesZoneAspect(stage.layer, stage.doc, true);
  expect(workAspect).toBeCloseTo(46 / 256, 4);
  expect(introAspect).toBeCloseTo(80 / 256, 4);
  expect(introAspect).toBeGreaterThan(workAspect);

  // Наклонный проход сверху вниз: в высокой зоне вертикальная составляющая
  // весит больше, поэтому порядок обхода у зон разный.
  const flow = brandSparklesCreateIntroFlow({ Math: { random: () => 0.9 } });
  expect(brandSparklesIntroOrder(stage.stars, flow, introAspect)).not.toEqual(
    brandSparklesIntroOrder(stage.stars, flow, workAspect)
  );
});

test('рабочий цикл раскладывает фазы по единому flow на весь период', () => {
  const stage = fakeSparkleStage({ starCount: 16, withBadge: false });
  brandSparklesLayout(stage.layer, stage.win);
  const order = brandSparklesStartWorkingLoop(stage.layer, stage.win, stage.doc);
  const delays = stage.stars.map((star) =>
    Number(star.style.getPropertyValue('--delay').replace('ms', ''))
  );

  expect(new Set(order).size).toBe(16);
  expect(new Set(delays).size).toBe(16);
  expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(4500);
  // Стартуют из погасшего состояния: отрицательных задержек (вход из середины
  // фазы) больше нет, иначе на переключении был бы виден рывок.
  expect(Math.min(...delays)).toBe(0);
  expect(stage.layer._brandSparklesWorkingState.aspect).toBeCloseTo(46 / 256, 4);
});

test('новая рабочая вспышка меняет только скрытую пару и продолжает flow', () => {
  const stage = fakeSparkleStage({
    starCount: 16,
    randomSeq: [0.03, 0.17, 0.29, 0.41, 0.58, 0.66, 0.74, 0.83, 0.91, 0.36, 0.52],
  });
  brandSparklesLayout(stage.layer, stage.win);
  const state = brandSparklesWorkingState(
    stage.layer,
    stage.win,
    stage.stars,
    brandSparklesCreateWorkingFlow({ Math: { random: () => 0.1 } }),
    0.2
  );
  // Курсор на ранге второй погасшей точки: подхватить поток должна именно она.
  state.cursor = state.rankByCell[Number(stage.stars[1].getAttribute('data-spark-cell'))];

  const before = stage.stars.map((star) => star.getAttribute('data-spark-cell'));
  const cells = brandSparklesRedistributeHidden(stage.layer, stage.win, stage.stars[0]);
  const after = stage.stars.map((star) => star.getAttribute('data-spark-cell'));

  expect(cells).toHaveLength(1);
  // Ячейками обмениваются ровно две погасшие точки, включая ту, что вспыхнула.
  const changed = after.map((cell, i) => (cell === before[i] ? -1 : i)).filter((i) => i >= 0);
  expect(changed).toHaveLength(2);
  expect(changed).toContain(0);
  expect(new Set(after)).toEqual(new Set(before));
});

test('рабочий курс меняется после одного прохода', () => {
  const stage = fakeSparkleStage({
    starCount: 16,
    randomSeq: [0.03, 0.17, 0.29, 0.41, 0.58, 0.66, 0.74, 0.83, 0.91, 0.36, 0.52],
  });
  brandSparklesLayout(stage.layer, stage.win);
  const state = brandSparklesWorkingState(
    stage.layer,
    stage.win,
    stage.stars,
    { mode: 'sweep', edge: 0, sourceX: -12, sourceY: 50, targetX: 112, targetY: 50 },
    0.2
  );
  state.events = 16;
  const before = state.flow;
  brandSparklesRedistributeHidden(stage.layer, stage.win, stage.stars[0]);
  expect(state.flow).not.toBe(before);
  expect(state.flow.edge).not.toBe(0);
  expect(state.events).toBe(1);
});

const VISIBLE_MS = 2750;
const CYCLE_MS = 5000;

// Момент старта вспышки = «сейчас» + --delay, который ставит перезапуск.
function collectFlashStarts(stage, untilMs, stepMs = 25) {
  const starts = [];
  const seen = new Map();
  const delayOf = (star) => Number(star.style.getPropertyValue('--delay').replace('ms', ''));
  const all = () => stage.stars.concat(stage.extraStars);

  all().forEach((star) => {
    seen.set(star, delayOf(star));
    starts.push(delayOf(star));
  });
  for (let t = stepMs; t <= untilMs; t += stepMs) {
    stage.advance(stepMs);
    all().forEach((star) => {
      const delay = delayOf(star);
      if (!seen.has(star) || seen.get(star) !== delay) {
        seen.set(star, delay);
        starts.push(t + delay);
      }
    });
  }
  return starts;
}

test('intro расширяет зону до краёв шапки и потом сжимает', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  brandSparklesFitIntroZone(stage.layer, stage.doc);
  expect(stage.layer.style.getPropertyValue('--spark-intro-top')).toBe('-17.00px');
  expect(stage.layer.style.getPropertyValue('--spark-intro-bottom')).toBe('-33.00px');
  expect(stage.layer.style.getPropertyValue('--spark-intro-band')).toBe('80.00%');
  expect(stage.layer.style.getPropertyValue('--spark-intro-side')).toBe('22%');

  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerClasses.has('is-intro-zone')).toBe(true);

  stage.flushRaf();
  expect(stage.layerClasses.has('is-intro-zone')).toBe(true);
  // Пока последняя вспышка серии видна, зону не трогаем: иначе виден обрез.
  stage.advance(3200 + VISIBLE_MS - 100);
  expect(stage.layerClasses.has('is-intro-zone')).toBe(true);
  stage.advance(200);
  expect(stage.layerClasses.has('is-intro-zone')).toBe(false);
});

test('смена зоны не двигает видимые искры и уводит погасшие в рабочую полосу', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  brandSparklesLayout(stage.layer, stage.win);
  stage.layerClasses.add('is-intro-zone');

  // Зона intro: верх -17px от локапа, высота 80px. Рабочая: -8px и 46px.
  const intro = brandSparklesZoneBox(stage.layer, stage.doc, true);
  const work = brandSparklesZoneBox(stage.layer, stage.doc, false);
  expect(intro).toMatchObject({ top: -17, height: 80 });
  expect(work).toMatchObject({ top: -8, height: 46 });

  const yOf = (star) => Number(star.style.getPropertyValue('--y').replace('%', ''));
  const pixelOf = (percent, box) => box.top + (percent / 100) * box.height;
  // stars[0] и stars[1] в стенде погасшие, остальные видимы.
  const visible = stage.stars[5];
  const beforePixel = pixelOf(yOf(visible), intro);

  brandSparklesCollapseZone(stage.layer, stage.doc, stage.win);

  expect(stage.layerClasses.has('is-intro-zone')).toBe(false);
  // Видимая искра осталась на том же месте в пикселях: сдвига не видно.
  expect(pixelOf(yOf(visible), work)).toBeCloseTo(beforePixel, 1);
  // Погасшая уже читается как точка своей рабочей ячейки, а не как перенос
  // пикселей из высокой зоны.
  const darkRow = Math.floor(Number(stage.stars[0].getAttribute('data-spark-cell')) / 4);
  expect(yOf(stage.stars[0])).toBeGreaterThan(darkRow * 25);
  expect(yOf(stage.stars[0])).toBeLessThan((darkRow + 1) * 25);
});

test('плотность не проваливается на стыке intro и рабочего режима', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  initBrandSparkles(stage.doc, stage.win);
  stage.flushRaf();

  const starts = collectFlashStarts(stage, 8000);
  const visibleAt = (t) => starts.filter((s) => s <= t && t < s + VISIBLE_MS).length;

  // Ни на переходе intro → рабочий режим, ни после него плотность не падает:
  // фазы подхватываются по одной, поэтому пустой паузы нет.
  let min = Infinity;
  for (let t = 1200; t <= 7000; t += 25) min = Math.min(min, visibleAt(t));
  expect(min).toBeGreaterThanOrEqual(6);
  // Intro — процесс, а не одновременная пачка: к середине разбега видно
  // заметно больше, чем в самом начале фронта.
  expect(visibleAt(400)).toBeLessThan(visibleAt(2200));
  expect(visibleAt(2800)).toBeGreaterThanOrEqual(14);
});

test('временные искры добавляются на старте и убираются после подхвата', () => {
  const stage = fakeSparkleStage({ starCount: 16 });
  initBrandSparkles(stage.doc, stage.win);
  stage.flushRaf();

  expect(stage.extraStars).toHaveLength(4);
  expect(stage.extraStars.every((star) => star.className.includes('brand-sparkle'))).toBe(true);
  expect(stage.extraStars.every((star) => star.getAttribute('data-spark-cell') != null)).toBe(true);

  const hrExtras = stage.extraStars.filter((star) =>
    /\bbrand-sparkle-triad-hr\b/.test(star.className)
  );
  const hlExtras = stage.extraStars.filter((star) =>
    /\bbrand-sparkle-triad-hl\b/.test(star.className)
  );
  expect(hrExtras).toHaveLength(1);
  expect(hlExtras).toHaveLength(1);
  expect(hrExtras[0].className).toMatch(/\bbrand-sparkle-extra\b/);
  expect(hlExtras[0].className).toMatch(/\bbrand-sparkle-extra\b/);
  expect(hrExtras[0].style.getPropertyValue('--sz')).toBe('11px');
  expect(hlExtras[0].style.getPropertyValue('--sz')).toBe('11px');
  expect(Number(hrExtras[0].getAttribute('data-spark-cell')) % 4).toBeGreaterThanOrEqual(2);
  expect(Number(hlExtras[0].getAttribute('data-spark-cell')) % 4).toBeLessThanOrEqual(1);
  expect(hrExtras[0].children.map((c) => c.className)).toEqual([
    'brand-sparkle-step brand-sparkle-step-2',
    'brand-sparkle-step brand-sparkle-step-3',
  ]);
  expect(hlExtras[0].children.map((c) => c.className)).toEqual([
    'brand-sparkle-step brand-sparkle-step-2',
    'brand-sparkle-step brand-sparkle-step-3',
  ]);
  expect(
    stage.extraStars.filter((star) => !/\bbrand-sparkle-triad\b/.test(star.className))
  ).toHaveLength(2);

  // Подхватывающая вспышка приходится на стык режимов, поэтому убираются они
  // позже основной серии.
  stage.advance(4000);
  expect(stage.extraStars).toHaveLength(4);
  stage.advance(5000);
  expect(stage.extraStars).toHaveLength(0);
  expect(stage.layer.querySelectorAll('.brand-sparkle')).toHaveLength(16);
});


test('мобильная пауза случайна в границах 3–6 секунд', () => {
  expect(brandSparklesMobileDelay({ Math: { random: () => 0 } })).toBe(3000);
  expect(brandSparklesMobileDelay({ Math: { random: () => 1 } })).toBe(6000);
});

test('проверка пересечения учитывает защитное поле вокруг бренда', () => {
  const rect = { left: 20, top: 20, right: 60, bottom: 50 };
  expect(brandSparklesIntersectsRect(5, 25, 8, rect, 10)).toBe(true);
  expect(brandSparklesIntersectsRect(1, 1, 8, rect, 10)).toBe(false);
});

test('на таче нет intro: одна мобильная искра вспыхивает и снова замирает', () => {
  const stage = fakeSparkleStage({
    starCount: 16,
    touch: true,
    // delay=4.5с, размер 8px; дальше выбор свободного поля и точка в нём.
    randomSeq: [0.5, 0.2, 0.3, 0.5, 0.5],
  });
  expect(brandSparklesMobile(stage.win)).toBe(true);
  initBrandSparkles(stage.doc, stage.win);

  expect(stage.layerClasses.has('is-intro')).toBe(false);
  expect(stage.layerClasses.has('is-intro-zone')).toBe(false);
  expect(stage.layerClasses.has('is-mobile-twinkle')).toBe(true);
  expect(stage.extraStars).toHaveLength(1);
  const mobile = stage.extraStars[0];
  expect(mobile.className).toBe('brand-sparkle brand-sparkle-mobile');
  expect(mobile.classList.contains('is-flashing')).toBe(false);

  // Первая пауза при random=0.5 — 4.5 с. Затем ровно одна короткая вспышка.
  stage.advance(4499);
  expect(mobile.classList.contains('is-flashing')).toBe(false);
  stage.advance(1);
  expect(mobile.classList.contains('is-flashing')).toBe(true);
  expect(['8px', '11px']).toContain(mobile.style.getPropertyValue('--sz'));
  const zone = stage.layer.getBoundingClientRect();
  const size = Number(mobile.style.getPropertyValue('--sz').replace('px', ''));
  const x = Number(mobile.style.getPropertyValue('--x').replace('px', ''));
  const y = Number(mobile.style.getPropertyValue('--y').replace('px', ''));
  expect(x).toBeGreaterThanOrEqual(0);
  expect(y).toBeGreaterThanOrEqual(0);
  expect(x + size).toBeLessThanOrEqual(zone.width);
  expect(y + size).toBeLessThanOrEqual(zone.height);
  stage.advance(900);
  expect(mobile.classList.contains('is-flashing')).toBe(false);
  expect(stage.layerRemoved()).toBe(false);
});

test('мобильная искра остаётся в рабочей зоне и не накрывает логотип с надписью', () => {
  const stage = fakeSparkleStage({ starCount: 16, touch: true, withBadge: false });
  const zone = stage.layer.getBoundingClientRect();

  // Много проб с разной случайностью: каждая позиция обязана быть валидной.
  for (let i = 0; i < 200; i++) {
    const win = { Math: { random: () => Math.random() } };
    const size = i % 2 === 0 ? 8 : 11;
    const point = brandSparklesMobilePoint(stage.doc, win, stage.layer, size);
    expect(point).not.toBeNull();

    // Внутри зоны целиком: искра не вылезает за полосу вокруг локапа.
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.x + size).toBeLessThanOrEqual(zone.width);
    expect(point.y + size).toBeLessThanOrEqual(zone.height);

    ['.brand-logo', '.brand-wordmark'].forEach((selector) => {
      const rect = stage.doc.querySelector(selector).getBoundingClientRect();
      expect(
        brandSparklesIntersectsRect(zone.left + point.x, zone.top + point.y, size, rect, 0)
      ).toBe(false);
    });
  }
});

test('на десктопе twinkle-pairs чередует одиночные и вспышки с кольцом', () => {
  const stage = fakeSparkleStage({
    starCount: 0,
    introMode: false,
    workingMode: 'twinkle-pairs',
    // wait; point; pair-ring; tilt; wait; point; single; tilt.
    randomSeq: [0, 0, 0, 0, 0.9, 0.5, 0, 0, 0, 0, 0.1, 0.5],
  });
  initBrandSparkles(stage.doc, stage.win);

  expect(stage.layerClasses.has('is-desktop-twinkle')).toBe(true);
  expect(stage.extraStars).toHaveLength(1);
  const twinkle = stage.extraStars[0];
  expect(twinkle.className).toBe('brand-sparkle brand-sparkle-desktop-twinkle');
  expect(twinkle.classList.contains('is-flashing')).toBe(false);

  stage.advance(3000);
  expect(twinkle.classList.contains('is-flashing')).toBe(true);
  expect(twinkle.style.getPropertyValue('--sz')).toBe('11px');
  expect(twinkle.classList.contains('brand-sparkle-pair')).toBe(true);
  expect(twinkle.getAttribute('data-sparkle-kind')).toBe('pair-ring');

  stage.advance(900);
  expect(twinkle.classList.contains('is-flashing')).toBe(false);
  stage.advance(2100);
  expect(twinkle.classList.contains('is-flashing')).toBe(true);
  expect(twinkle.style.getPropertyValue('--sz')).toBe('11px');
  expect(twinkle.classList.contains('brand-sparkle-pair')).toBe(false);
  expect(twinkle.getAttribute('data-sparkle-kind')).toBe('single');
  expect(stage.layerRemoved()).toBe(false);
});

test('peer-приход запускает intro после header-swap-ready', () => {
  const stage = fakeSparkleStage({ headerSwap: true });
  initBrandSparkles(stage.doc, stage.win);
  expect(stage.layerClasses.has('is-intro')).toBe(false);
  stage.rootClasses.add('header-swap-ready');
  stage.triggerMo();
  expect(stage.layerClasses.has('is-intro')).toBe(true);
});

test('reduced-motion и screens-флаг — без intro', () => {
  const reduced = fakeSparkleStage({ reduced: true });
  initBrandSparkles(reduced.doc, reduced.win);
  expect(reduced.layerClasses.has('is-intro')).toBe(false);

  const screens = fakeSparkleStage({
    withBadge: false,
    pagePath: '/landing/screens.html',
    useConfiguredModes: true,
  });
  initBrandSparkles(screens.doc, screens.win);
  expect(screens.layerClasses.has('is-intro')).toBe(false);
  // Но равномерная раскладка нужна и на screens.
  expect(screens.stars.every((star) => star.getAttribute('data-spark-cell') != null)).toBe(true);
});

test('brandSparklesWhenBrandVisible без swap зовёт сразу', () => {
  let called = 0;
  brandSparklesWhenBrandVisible(
    { documentElement: { classList: { contains: () => false } } },
    { MutationObserver: null, setTimeout: () => 0 },
    () => {
      called += 1;
    }
  );
  expect(called).toBe(1);
});
