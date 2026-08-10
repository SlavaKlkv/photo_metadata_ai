'use strict';

const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const irisDir = path.join(landingDir, 'brand-iris');

// Модули лендинга подключаются обычными <script> и общаются через глобальную
// область; в Node ту же роль играет globalThis, поэтому порядок require —
// тот же, что порядок тегов в разметке.
const { BRAND_IRIS, brandIrisArriveMs, brandIrisBore, brandIrisPath } = require(
  path.join(irisDir, 'geometry.js')
);
const { brandIrisEaseShut, brandIrisEaseOpen, brandIrisEaseRest } = require(
  path.join(irisDir, 'motion.js')
);
require(path.join(irisDir, 'handoff.js'));
require(path.join(irisDir, 'presence.js'));
const { initBrandIris } = require(path.join(irisDir, 'init.js'));

// Кромки лепестков — четырёхугольники: точка касания, край кольца отверстия
// и два дальних угла, уходящих под корпус.
function readBlades(d) {
  const re = /M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)Z/g;
  const blades = [];
  let m;
  while ((m = re.exec(d)) !== null) {
    const [, x1, y1, x2, y2, x3, y3, x4, y4] = m.map(Number);
    blades.push({ touch: [x1, y1], rim: [x2, y2], far: [x3, y3], tail: [x4, y4] });
  }
  return blades;
}

function readCircles(d) {
  return [...d.matchAll(/A([\d.]+) [\d.]+ 0 1 ([01])/g)]
    .map((m) => ({ r: Number(m[1]), sweep: Number(m[2]) }))
    .filter((_, i) => i % 2 === 0);
}

function radius([x, y]) {
  return Math.hypot(x - BRAND_IRIS.CENTER, y - BRAND_IRIS.CENTER);
}

function angleOf([x, y]) {
  return (Math.atan2(y - BRAND_IRIS.CENTER, x - BRAND_IRIS.CENTER) * 180) / Math.PI;
}

// Расстояние от центра метки до прямой, на которой лежит кромка лепестка.
function edgeDistance(blade) {
  const c = BRAND_IRIS.CENTER;
  const [ax, ay] = blade.touch;
  const [bx, by] = blade.tail;
  const len = Math.hypot(bx - ax, by - ay);
  return Math.abs((bx - ax) * (ay - c) - (ax - c) * (by - ay)) / len;
}

describe('геометрия диафрагмы', () => {
  test('в покое путь повторяет метку из icon.svg', () => {
    const d = brandIrisPath(0);
    const circles = readCircles(d);

    // Корпус (внешний контур + вырез) и кольцо отверстия с таким же вырезом.
    // Координаты пути округлены до тысячных, поэтому сравнение неточное.
    expect(circles.map((circle) => circle.sweep)).toEqual([1, 0, 1, 0]);
    [
      BRAND_IRIS.R_BODY,
      BRAND_IRIS.R_BORE,
      BRAND_IRIS.R_REST + BRAND_IRIS.EDGE,
      BRAND_IRIS.R_REST,
    ].forEach((expected, i) => {
      expect(circles[i].r).toBeCloseTo(expected, 2);
    });
    expect(brandIrisBore(0)).toBeCloseTo(BRAND_IRIS.R_REST, 6);

    const blades = readBlades(d);
    expect(blades).toHaveLength(BRAND_IRIS.BLADES);
    // Точки касания стоят там же, где в icon.svg: шесть штук через 60°,
    // первая — под 60°.
    const angles = blades.map(
      (blade) => Math.round(((angleOf(blade.touch) % 360) + 360) % 360) % 360
    );
    expect(angles).toEqual([60, 120, 180, 240, 300, 0]);
  });

  test('наведение раскрывает отверстие, нажатие закрывает его до видимого кружка', () => {
    expect(brandIrisBore(-1)).toBeGreaterThan(BRAND_IRIS.R_REST);
    expect(brandIrisBore(1)).toBeCloseTo(BRAND_IRIS.R_SHUT, 6);

    // Закрытый затвор — это не точка: отверстие должно остаться различимым
    // и на 30 px, поэтому кружок заметно шире толщины кромки.
    expect(BRAND_IRIS.R_SHUT).toBeGreaterThan(1.5);
    // Раскрытое кольцо не наезжает на корпус.
    expect(brandIrisBore(-1) + BRAND_IRIS.EDGE).toBeLessThan(BRAND_IRIS.R_BORE);
  });

  test('лепестки проворачиваются в обе стороны от покоя', () => {
    const rest = readBlades(brandIrisPath(0))[0];
    const shut = readBlades(brandIrisPath(1))[0];
    const open = readBlades(brandIrisPath(-1))[0];

    // Угол считаем по краю кольца отверстия: у самой точки касания на упоре
    // радиус мал, и округление пути заметно шумит.
    expect(angleOf(shut.rim)).toBeCloseTo(angleOf(rest.rim) - BRAND_IRIS.SWING, 1);
    expect(angleOf(open.rim)).toBeCloseTo(angleOf(rest.rim) + BRAND_IRIS.SWING, 1);
  });

  test('отверстие меняется монотонно и замедляется к закрытому концу', () => {
    const steps = [];
    for (let i = 0; i <= 20; i++) steps.push(brandIrisBore(-1 + (2 * i) / 20));

    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
    // Как в объективе: у закрытого края кривошип идёт полого, и последние доли
    // хода меняют отверстие заметно слабее, чем середина.
    const atMiddle = steps[9] - steps[10];
    const nearShut = steps[19] - steps[20];
    expect(nearShut).toBeLessThan(atMiddle * 0.8);
  });

  test('кромка лепестка всё время касается отверстия', () => {
    for (let i = 0; i <= 20; i++) {
      const t = -1 + (2 * i) / 20;
      for (const blade of readBlades(brandIrisPath(t))) {
        expect(edgeDistance(blade)).toBeCloseTo(brandIrisBore(t), 2);
        // Внешняя сторона кромки отстоит от неё ровно на толщину кромки.
        expect(radius(blade.rim)).toBeCloseTo(brandIrisBore(t) + BRAND_IRIS.EDGE, 2);
      }
    }
  });

  // Регрессия: если кромка не дотягивается до корпуса, на срезе появляется
  // ступенька — торцы обязаны прятаться под кольцом корпуса на всём ходу,
  // включая отдачу пружины за крайние положения.
  test('торцы лепестков всегда скрыты под корпусом', () => {
    for (let i = 0; i <= 24; i++) {
      const t = -BRAND_IRIS.LIMIT + (i / 24) * 2 * BRAND_IRIS.LIMIT;
      for (const blade of readBlades(brandIrisPath(t))) {
        expect(radius(blade.far)).toBeLessThanOrEqual(BRAND_IRIS.R_BODY + 0.01);
        expect(radius(blade.tail)).toBeGreaterThan(BRAND_IRIS.R_BORE);
      }
    }
  });
});

describe('характер хода', () => {
  test('спуск затвора идёт до упора без перелёта', () => {
    expect(brandIrisEaseShut(0)).toBeCloseTo(0, 6);
    expect(brandIrisEaseShut(1)).toBeCloseTo(1, 6);
    let previous = 0;
    for (let i = 1; i <= 20; i++) {
      const v = brandIrisEaseShut(i / 20);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
    // Пружина срывается сразу: за первую четверть времени проходится
    // больше половины хода.
    expect(brandIrisEaseShut(0.25)).toBeGreaterThan(0.5);
  });

  test('раскрытие при наведении идёт плавно, без рывка на краях', () => {
    expect(brandIrisEaseOpen(0)).toBeCloseTo(0, 6);
    expect(brandIrisEaseOpen(1)).toBeCloseTo(1, 6);
    expect(brandIrisEaseOpen(0.5)).toBeCloseTo(0.5, 6);
    for (let i = 0; i <= 20; i++) {
      const v = brandIrisEaseOpen(i / 20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('возврат в покой проскакивает положение покоя и садится обратно', () => {
    expect(brandIrisEaseRest(1)).toBeCloseTo(1, 6);
    const peak = Math.max(...Array.from({ length: 100 }, (_, i) => brandIrisEaseRest(i / 100)));
    expect(peak).toBeGreaterThan(1);
    // Перелёт остаётся в пределах, на которых торцы ещё скрыты под корпусом.
    expect(peak - 1).toBeLessThan(BRAND_IRIS.LIMIT - 1);
  });
});

// DOM подделан вручную: в desktop-наборе нет jsdom, а контракт initBrandIris
// сводится к querySelector, слушателям, setAttribute('d') и sessionStorage.
function fakeStage({
  reduced = false,
  rect = { left: 24, top: 17, width: 180, height: 30 },
  hover = false,
  stored,
  headerSwap = false,
  elementFromPointHit = false,
  hitBlind = false,
} = {}) {
  const fullRect = {
    left: rect.left,
    top: rect.top,
    width: rect.width != null ? rect.width : 180,
    height: rect.height != null ? rect.height : 30,
    get right() {
      return this.left + this.width;
    },
    get bottom() {
      return this.top + this.height;
    },
  };
  const pathEl = {
    d: null,
    setAttribute(name, value) {
      if (name === 'd') this.d = value;
    },
  };
  const listeners = {};
  const winListeners = {};
  // hover и hit-test меняются по ходу сценария: курсор уходит с логотипа,
  // а бренд доезжает под него уже после первого hit-test.
  let hovering = hover;
  // Клавиатурный фокус: клик мышью его не даёт, поэтому у стенда он отдельный.
  let focusVisible = false;
  let hitting = elementFromPointHit;
  // Бренд скрыт под header-swap и едет FLIP-ом: hit-test его не находит даже
  // под самым курсором.
  let blind = hitBlind;
  const brand = {
    style: {},
    querySelector: (selector) => (selector === '.brand-blades' ? pathEl : null),
    addEventListener: (type, handler) => {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    getBoundingClientRect: () => fullRect,
    matches: (selector) => {
      if (selector === ':hover') return hovering;
      if (selector === ':focus-visible') return focusVisible;
      return false;
    },
  };
  const media = { matches: reduced, addEventListener: () => {} };
  const store = new Map();
  if (stored !== undefined) store.set(BRAND_IRIS.HANDOFF_KEY, JSON.stringify(stored));
  let nextFrame = 1;
  let queue = [];
  let nextTimer = 1;
  let timers = [];
  const rootClasses = new Set(headerSwap ? ['header-swap'] : []);
  const moCallbacks = [];
  const docStyle = { cursor: '' };
  const win = {
    MutationObserver: function (cb) {
      moCallbacks.push(cb);
      return {
        observe: () => {},
        disconnect: () => {},
      };
    },
    setTimeout(cb, ms) {
      const id = nextTimer++;
      timers.push({ id, at: win.now + ms, cb });
      return id;
    },
    clearTimeout(id) {
      timers = timers.filter((timer) => timer.id !== id);
    },
    now: 0,
    performance: { now: () => win.now },
    matchMedia: () => media,
    requestAnimationFrame(cb) {
      const id = nextFrame++;
      queue.push({ id, cb });
      return id;
    },
    cancelAnimationFrame(id) {
      queue = queue.filter((item) => item.id !== id);
    },
    addEventListener: (type, handler, options) => {
      (winListeners[type] = winListeners[type] || []).push({
        handler,
        once: Boolean(options && options.once),
      });
    },
    sessionStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    // Та же store: dual-write handoff в localStorage для target=_blank.
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
  };

  const docEl = {
    classList: {
      contains: (name) => rootClasses.has(name),
      add: (...names) => {
        names.forEach((n) => rootClasses.add(n));
        moCallbacks.forEach((cb) => cb());
      },
      remove: (...names) => {
        names.forEach((n) => rootClasses.delete(n));
        moCallbacks.forEach((cb) => cb());
      },
    },
    style: docStyle,
  };

  const docListeners = {};
  const doc = {
    querySelectorAll: () => [brand],
    documentElement: docEl,
    elementFromPoint: (x, y) => {
      if (hitting || hovering) return brand;
      if (blind) return null;
      if (
        typeof x === 'number' &&
        x >= fullRect.left &&
        x <= fullRect.right &&
        y >= fullRect.top &&
        y <= fullRect.bottom
      ) {
        return brand;
      }
      return null;
    },
    addEventListener: (type, handler) => {
      (docListeners[type] = docListeners[type] || []).push(handler);
    },
  };

  initBrandIris(doc, win);

  const advance = (ms) => {
    win.now += ms;
    const dueTimers = timers.filter((timer) => timer.at <= win.now);
    timers = timers.filter((timer) => timer.at > win.now);
    dueTimers.forEach((timer) => timer.cb());
    const due = queue;
    queue = [];
    due.forEach((item) => item.cb(win.now));
  };

  return {
    pathEl,
    brand,
    docStyle,
    rootClasses,
    markLeaving: () => docEl.classList.add('header-swap-out'),
    clearLeaving: () => docEl.classList.remove('header-swap-out'),
    setHover: (value) => {
      hovering = value;
    },
    setHit: (value) => {
      hitting = value;
    },
    setFocusVisible: (value) => {
      focusVisible = value;
    },
    setBlind: (value) => {
      blind = value;
    },
    fire: (type, event) => (listeners[type] || []).forEach((handler) => handler(event)),
    fireDoc: (type, event) => (docListeners[type] || []).forEach((handler) => handler(event)),
    fireWindow: (type, event) => {
      const entries = winListeners[type] || [];
      winListeners[type] = entries.filter((entry) => {
        entry.handler(event);
        return !entry.once;
      });
    },
    hasListener: (type) => Boolean(listeners[type] && listeners[type].length),
    advance,
    settleTravel: () => {
      advance(0);
      advance(0);
    },
    stored: () => {
      const raw = store.get(BRAND_IRIS.HANDOFF_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    pendingFrame: () => queue.length > 0,
  };
}

describe('поведение метки в шапке', () => {
  test('наведение раскрывает затвор, уход курсора возвращает метку в покой', () => {
    const stage = fakeStage();

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS / 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(-brandIrisEaseOpen(0.5)));
    expect(stage.pendingFrame()).toBe(true);

    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));
    expect(stage.pendingFrame()).toBe(false);

    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('нажатие захлопывает затвор, и он остаётся закрытым до ухода курсора', () => {
    const stage = fakeStage();

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));

    stage.fire('mousedown');
    stage.advance(BRAND_IRIS.SHUT_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Повторное наведение и фокус залипший затвор не раскрывают.
    stage.fire('mouseenter');
    stage.fire('focus');
    expect(stage.pendingFrame()).toBe(false);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));

    // После ухода курсора залипание снято: наведение снова раскрывает затвор.
    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));
  });

  // Регрессия: клик по логотипу ведёт на #top, и переход к якорю снимает с
  // ссылки фокус. Пока курсор на бренде, такой blur не должен раскрывать
  // затвор обратно — иначе метка захлопывалась и тут же возвращалась в покой.
  test('потеря фокуса под курсором не сбрасывает закрытый затвор', () => {
    const stage = fakeStage();

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS);
    stage.fire('mousedown');
    stage.advance(BRAND_IRIS.SHUT_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.fire('blur');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Курсор ушёл — только теперь метка возвращается в покой.
    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('нажатие на полураскрытой метке подхватывает текущее положение лепестков', () => {
    const stage = fakeStage();

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS * 0.25);
    const halfway = stage.pathEl.d;
    expect(halfway).not.toBe(brandIrisPath(0));

    stage.fire('mousedown');
    // Первый кадр спуска стартует от текущего положения, а не от покоя.
    stage.advance(0);
    expect(stage.pathEl.d).toBe(halfway);

    stage.advance(BRAND_IRIS.SHUT_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));
  });

  test('клавиатура ведёт затвор так же: фокус раскрывает, Enter спускает', () => {
    const stage = fakeStage();

    expect(stage.hasListener('focus')).toBe(true);
    expect(stage.hasListener('blur')).toBe(true);

    stage.setFocusVisible(true);
    stage.fire('focus');
    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));

    stage.fire('keydown', { key: 'Enter' });
    stage.advance(BRAND_IRIS.SHUT_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.fire('blur');
    stage.advance(BRAND_IRIS.REST_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('посторонние клавиши затвор не спускают', () => {
    const stage = fakeStage();

    stage.setFocusVisible(true);
    stage.fire('focus');
    stage.advance(BRAND_IRIS.OPEN_MS);
    stage.fire('keydown', { key: 'Tab' });
    expect(stage.pendingFrame()).toBe(false);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));
  });

  test('при prefers-reduced-motion затвор не двигается', () => {
    const stage = fakeStage({ reduced: true });

    stage.fire('mouseenter');
    stage.fire('mousedown');
    expect(stage.pendingFrame()).toBe(false);
    expect(stage.pathEl.d).toBeNull();

    stage.fire('mouseleave');
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });
});

// index.html и screens.html — отдельные документы: затвор и FLIP-позиция
// бренда переживают переход. Сама шапка fade-ит соседей (header-swap),
// бренд не гаснет, а доезжает с сохранённых координат.
describe('переход между страницами', () => {
  test('уходя со страницы, бренд запоминает место, затвор и указатель', () => {
    const stage = fakeStage({ rect: { left: 24, top: 17 } });

    stage.fireDoc('pointermove', { clientX: 40, clientY: 28 });
    stage.fire('mouseenter');
    stage.fire('mousedown', { clientX: 40, clientY: 28 });
    stage.advance(BRAND_IRIS.SHUT_MS);
    stage.markLeaving(); // peer-nav: header-swap-out
    stage.fireWindow('pagehide');

    const saved = stage.stored();
    expect(saved.x).toBe(24);
    expect(saved.y).toBe(17);
    expect(saved.t).toBeCloseTo(1, 6);
    expect(saved.to).toBe(1);
    expect(saved.over).toBe(1);
    expect(saved.px).toBe(40);
    expect(saved.py).toBe(28);
    expect(Date.now() - saved.at).toBeLessThan(BRAND_IRIS.HANDOFF_TTL);
  });

  // Регрессия: header-swap откладывает navigate; перед pagehide браузер
  // шлёт mouseleave — rest() раньше обнулял handoff.
  test('mouseleave во время header-swap-out не сбрасывает затвор', () => {
    const stage = fakeStage({ rect: { left: 24, top: 17 } });

    stage.fire('mouseenter');
    stage.fire('mousedown');
    stage.advance(BRAND_IRIS.SHUT_MS / 2);
    // Уход начался: класс как ставит header-swap.js
    stage.markLeaving();
    // Выгрузка: leave раньше pagehide
    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS);
    // rest не должен был пойти — t не в покое
    expect(stage.pathEl.d).not.toBe(brandIrisPath(0));
    stage.fireWindow('pagehide');

    const saved = stage.stored();
    expect(saved.to).toBe(1);
    expect(saved.t).toBeGreaterThan(0.3);
  });

  // transform ставится синхронно до header-swap-ready, поэтому первый
  // видимый кадр уже на старых координатах — без рывка «своё → старое».
  test('на новой странице бренд доезжает с сохранённых координат', () => {
    const stage = fakeStage({
      headerSwap: true,
      rect: { left: 24, top: 15.2 },
      stored: { x: 24, y: 17, t: 0, to: 0, at: Date.now() },
    });

    expect(stage.brand.style.transform).toBe('translate(0px, 1.8px)');
    expect(stage.brand.style.transition).toBe('none');

    stage.settleTravel();
    expect(stage.brand.style.transform).toBe('');
    expect(stage.brand.style.transition).toContain(`${BRAND_IRIS.TRAVEL_MS}ms`);
  });

  test('без header-swap handoff выбрасывается (F5 не доигрывает затвор)', () => {
    const stage = fakeStage({
      headerSwap: false,
      rect: { left: 24, top: 15.2 },
      stored: { x: 24, y: 17, t: 1, to: 1, at: Date.now() },
    });

    expect(stage.brand.style.transform).toBeUndefined();
    // Запись съедена, d не трогали — как у свежей метки.
    expect(stage.pathEl.d).toBeNull();
    expect(stage.stored()).toBeNull();
  });

  test('pagehide без header-swap-out handoff не пишет (обычный refresh)', () => {
    const stage = fakeStage({ rect: { left: 24, top: 17 } });

    stage.fire('mouseenter');
    stage.fire('mousedown');
    stage.advance(BRAND_IRIS.SHUT_MS);
    stage.fireWindow('pagehide');

    expect(stage.stored()).toBeNull();
  });

  // target=_blank: swap-out снимают после open — iris снова живой на исходной вкладке.
  test('снятие header-swap-out размораживает метку (остались на странице)', () => {
    const stage = fakeStage({ rect: { left: 24, top: 17 } });

    stage.markLeaving();
    expect(stage.stored()).not.toBeNull();
    stage.clearLeaving();

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));
  });

  // Регрессия: метка появлялась там, где её застал переход (часто — в покое),
  // и захлопывалась уже на новой странице. На самом видном месте шапки это
  // читалось как вспышка, поэтому теперь показываем сразу конечное положение:
  // щелчок случился на покинутой странице, его ход виден там же.
  test('на новой странице метка появляется сразу закрытой, без вспышки покоя', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: true,
      stored: { x: 24, y: 17, t: -0.9, to: 1, at: Date.now() },
    });

    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    expect(stage.pendingFrame()).toBe(false);
    stage.advance(BRAND_IRIS.SHUT_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Залипание тоже перенеслось: наведение не раскрывает затвор.
    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.setHover(false); // курсор действительно сошёл с логотипа
    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  // :hover сразу после document load часто false, даже если курсор на лого.
  // hit-test по координатам восстанавливает hovered без matches(':hover').
  test('после перехода hit-test на лого восстанавливает наведение и pointer', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: {
        x: 24,
        y: 17,
        t: 1,
        to: 1,
        over: 1,
        px: 50,
        py: 25,
        at: Date.now(),
      },
    });

    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    expect(stage.docStyle.cursor).toBe('pointer');
    expect(stage.brand.style.cursor).toBe('pointer');

    // SETTLE не уводит в покой, пока hit-test говорит «над брендом».
    stage.advance(BRAND_IRIS.SETTLE_MS);
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));
  });

  // Регрессия: клик по плитке на screens, на index курсор слева от лого —
  // over=1 + FLIP не должны залипать в open без hit.
  test('курсор слева от лого после перехода: open не зависает, уход → покой', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      // бренд на 24; указатель левее плитки (как после клика только по icon)
      rect: { left: 24, top: 17, width: 180, height: 30 },
      stored: {
        x: 24,
        y: 17,
        t: -0.5,
        to: -1,
        over: 1,
        px: 10,
        py: 25,
        at: Date.now(),
      },
    });

    // Сразу hit false — resume не ставит hovered. SETTLE/FLIP-таймер → rest.
    stage.advance(Math.max(BRAND_IRIS.SETTLE_MS, BRAND_IRIS.TRAVEL_MS + 40));
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
    expect(stage.docStyle.cursor).toBe('');
  });

  test('синтетический hover: уход мыши с лого сбрасывает диафрагму', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: {
        x: 24,
        y: 17,
        t: -1,
        to: -1,
        over: 1,
        px: 50,
        py: 25,
        at: Date.now(),
      },
    });

    // hit: over brand → open
    stage.advance(BRAND_IRIS.OPEN_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));

    // сдвиг в сторону — hit false, rest (без native mouseleave)
    stage.fireWindow('pointermove', { clientX: 8, clientY: 25 });
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('если over и hit-test ложны, SETTLE уводит в покой', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: {
        x: 24,
        y: 17,
        t: 1,
        to: 1,
        over: 0,
        px: 900,
        py: 900,
        at: Date.now(),
      },
    });

    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    stage.advance(Math.max(BRAND_IRIS.SETTLE_MS, BRAND_IRIS.TRAVEL_MS + 40));
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  // :hover сразу после загрузки ещё может не примениться: браузер уточняет его
  // при первом движении мыши. Поэтому курсору дают короткое окно объявиться.
  test('курсор, объявившийся сразу после перехода, удерживает затвор закрытым', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: { x: 24, y: 17, t: -0.9, to: 1, at: Date.now() },
    });

    stage.advance(BRAND_IRIS.SETTLE_MS / 3);
    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.SHUT_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    stage.advance(BRAND_IRIS.OPEN_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('если курсор так и не объявился, метка доигрывает возврат в покой', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: { x: 24, y: 17, t: -0.9, to: 1, at: Date.now() },
    });

    stage.advance(BRAND_IRIS.SHUT_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    stage.advance(BRAND_IRIS.SETTLE_MS);
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));

    stage.fire('mouseenter');
    stage.advance(BRAND_IRIS.OPEN_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(-1));
  });

  // Регрессия: сразу после перехода браузер пересобирает hover нового
  // документа и шлёт mouseleave, хотя курсор с логотипа не уходил. Раньше по
  // такому событию снималась фиксация, метка уезжала в покой, и первое же
  // движение мыши раскрывало затвор — на главной он оказывался распахнут.
  test('фантомный mouseleave после перехода не снимает затвор с фиксации', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: { x: 24, y: 17, t: 1, to: 1, over: 1, px: 50, py: 25, at: Date.now() },
    });

    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Курсор на месте (hit-test по точке это подтверждает) — leave игнорируем.
    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // И движение внутри логотипа затвор тоже не раскрывает.
    stage.fireWindow('pointermove', { clientX: 52, clientY: 26 });
    stage.advance(BRAND_IRIS.OPEN_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Настоящий уход — по точке вне бренда — возвращает метку в покой.
    stage.fireWindow('pointermove', { clientX: 8, clientY: 25 });
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  // Регрессия: hit-test в момент загрузки мог не найти бренд (метка ещё едет
  // на своё место). К концу окна прибытия курсор оказывался на логотипе, но
  // затвор всё равно уходил в покой — прямо под курсором.
  test('курсор, найденный к концу окна прибытия, удерживает затвор закрытым', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      // Бренд ещё скрыт и едет: hit-test его не находит, хотя точка — на нём.
      hitBlind: true,
      stored: { x: 24, y: 17, t: 1, to: 1, over: 1, px: 50, py: 25, at: Date.now() },
    });

    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Бренд доехал и снова находится под указателем.
    stage.setBlind(false);
    stage.advance(brandIrisArriveMs());
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));
    expect(stage.docStyle.cursor).toBe('pointer');
  });

  // Регрессия: клик по надписи бренда на узком экране (шапка главной выше,
  // логотип едет на новое место). Пока бренд скрыт и в пути, hit-test не
  // находит его под курсором, и leave от смены документа снимал затвор с
  // фиксации — метка захлопывалась и тут же раскрывалась под курсором.
  test('затвор не раскрывается, пока бренд скрыт и едет на новое место', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      hitBlind: true,
      // Точка — на надписи бренда; ход прерван на полпути к упору.
      stored: { x: 24, y: 17, t: 0.6, to: 1, over: 1, px: 166, py: 32, at: Date.now() },
    });

    // Щелчок доигрывается уже на новой странице.
    stage.advance(BRAND_IRIS.SHUT_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Смена документа шлёт leave, а курсор при этом никуда не двигался.
    stage.fire('mouseleave');
    stage.fireWindow('pointermove', { clientX: 166, clientY: 32 });
    stage.advance(BRAND_IRIS.REST_MS);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // Бренд доехал и снова находится под курсором — затвор остаётся закрытым.
    stage.setBlind(false);
    stage.advance(brandIrisArriveMs());
    stage.advance(BRAND_IRIS.OPEN_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    // И только уход курсора возвращает метку в покой.
    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  // Окно прибытия ограничено: дальше mouseleave снова принимается как есть,
  // иначе метка залипала бы закрытой, если мышь ушла из окна без движения.
  test('после окна прибытия mouseleave снова возвращает метку в покой', () => {
    const stage = fakeStage({
      headerSwap: true,
      hover: false,
      stored: { x: 24, y: 17, t: 1, to: 1, over: 1, px: 50, py: 25, at: Date.now() },
    });

    stage.advance(brandIrisArriveMs() + 20);
    expect(stage.pathEl.d).toBe(brandIrisPath(1));

    stage.fire('mouseleave');
    stage.advance(BRAND_IRIS.REST_MS * 2);
    expect(stage.pathEl.d).toBe(brandIrisPath(0));
  });

  test('засохшая запись не влияет на свежий заход', () => {
    const stage = fakeStage({
      headerSwap: true,
      rect: { left: 24, top: 15.2 },
      stored: { x: 400, y: 17, t: 1, to: 1, at: Date.now() - BRAND_IRIS.HANDOFF_TTL - 1 },
    });

    expect(stage.pathEl.d).toBeNull();
    expect(stage.brand.style.transform).toBeUndefined();
  });

  test('запись расходуется один раз', () => {
    const stage = fakeStage({
      headerSwap: true,
      stored: { x: 24, y: 17, t: 1, to: 1, at: Date.now() },
    });

    expect(stage.stored()).toBeNull();
  });

  test('при prefers-reduced-motion бренд никуда не едет', () => {
    const stage = fakeStage({
      reduced: true,
      headerSwap: true,
      rect: { left: 24, top: 15.2 },
      stored: { x: 400, y: 17, t: 1, to: 1, at: Date.now() },
    });

    expect(stage.brand.style.transform).toBeUndefined();
    expect(stage.pathEl.d).toBeNull();
  });
});
