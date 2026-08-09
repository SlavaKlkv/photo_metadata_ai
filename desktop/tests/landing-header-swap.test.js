'use strict';

const fs = require('fs');
const path = require('path');

const landingDir = path.resolve(__dirname, '../../docs/landing');
const {
  LANDING_HEADER_SWAP,
  landingHeaderPageKey,
  landingHeaderIsPeer,
  initLandingHeaderSwap,
} = require(path.join(landingDir, 'header-swap.js'));

test.each([
  ['/photo_metadata_ai/landing/', 'index'],
  ['/photo_metadata_ai/landing', 'index'],
  ['/photo_metadata_ai/landing/index.html', 'index'],
  ['/landing/screens.html', 'screens'],
  ['/other/page.html', null],
])('landingHeaderPageKey(%s) → %s', (pathname, expected) => {
  expect(landingHeaderPageKey(pathname)).toBe(expected);
});

test('peer только между index и screens в одной сессии лендинга', () => {
  const base = 'https://slavaklkv.github.io/photo_metadata_ai/landing/screens.html';
  expect(
    landingHeaderIsPeer('/photo_metadata_ai/landing/screens.html', 'index.html', base)
  ).toBe(true);
  expect(
    landingHeaderIsPeer(
      '/photo_metadata_ai/landing/index.html',
      'screens.html#shot-01',
      'https://slavaklkv.github.io/photo_metadata_ai/landing/index.html'
    )
  ).toBe(true);
  expect(
    landingHeaderIsPeer(
      '/photo_metadata_ai/landing/screens.html',
      'https://github.com/SlavaKlkv/photo_metadata_ai',
      base
    )
  ).toBe(false);
  expect(
    landingHeaderIsPeer(
      '/photo_metadata_ai/landing/screens.html',
      'screens.html#shot-02',
      base
    )
  ).toBe(false);
});

function fakeHeaderStage({
  reduced = false,
  pathName = '/landing/screens.html',
  headerSwap = false,
} = {}) {
  const classes = new Set(headerSwap ? ['header-swap'] : []);
  const root = {
    classList: {
      contains: (name) => classes.has(name),
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
    },
  };
  const listeners = {};
  let queue = [];
  let timers = [];
  let nextTimer = 1;
  let nextFrame = 1;
  let now = 0;
  const store = new Map();
  const localStore = new Map();
  let navigated = null;
  let opened = null;
  const pageHref = `https://example.test${pathName}`;

  const win = {
    location: {
      pathname: pathName,
      get href() {
        return navigated || pageHref;
      },
      set href(value) {
        navigated = value;
      },
    },
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame(cb) {
      const id = nextFrame++;
      queue.push({ id, cb });
      return id;
    },
    setTimeout(cb, ms) {
      const id = nextTimer++;
      timers.push({ id, at: now + ms, cb });
      return id;
    },
    addEventListener: () => {},
    open: (href, target, features) => {
      opened = { href, target, features };
      return {};
    },
    sessionStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    localStorage: {
      getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
      setItem: (key, value) => localStore.set(key, value),
      removeItem: (key) => localStore.delete(key),
    },
  };

  const doc = {
    documentElement: root,
    addEventListener: (type, handler) => {
      (listeners[type] = listeners[type] || []).push(handler);
    },
  };

  initLandingHeaderSwap(doc, win);

  const advance = (ms = 0) => {
    now += ms;
    const dueTimers = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    dueTimers.forEach((t) => t.cb());
    const due = queue;
    queue = [];
    due.forEach((item) => item.cb());
  };

  const fireClick = (link) => {
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target: link,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    (listeners.click || []).forEach((handler) => handler(event));
    return event;
  };

  return {
    classes,
    fireClick,
    advance,
    store,
    localStore,
    get navigated() {
      return navigated;
    },
    get opened() {
      return opened;
    },
  };
}

describe('header-swap: enter / leave', () => {
  test('на входе с маркером шапка проявляется во втором кадре', () => {
    const stage = fakeHeaderStage({ headerSwap: true });
    expect(stage.classes.has('header-swap')).toBe(true);
    expect(stage.classes.has('header-swap-ready')).toBe(false);

    stage.advance(0);
    stage.advance(0);
    expect(stage.classes.has('header-swap-ready')).toBe(true);

    stage.advance(LANDING_HEADER_SWAP.ENTER_MS + 80);
    expect(stage.classes.has('header-swap')).toBe(false);
    expect(stage.classes.has('header-swap-ready')).toBe(false);
  });

  test('клик на соседнюю страницу: fade-out, флаг, отложенный переход', () => {
    const stage = fakeHeaderStage();
    const link = {
      tagName: 'A',
      href: 'https://example.test/landing/index.html',
      target: '',
      hasAttribute: () => false,
    };

    const event = stage.fireClick(link);
    expect(event.defaultPrevented).toBe(true);
    expect(stage.classes.has('header-swap-out')).toBe(true);
    expect(stage.store.get(LANDING_HEADER_SWAP.KEY)).toBe('1');
    expect(stage.navigated).toBeNull();

    stage.advance(LANDING_HEADER_SWAP.LEAVE_MS);
    expect(stage.navigated).toBe('https://example.test/landing/index.html');
  });

  test('target=_blank peer: fade-out, localStorage mark, open, вернуть шапку', () => {
    const stage = fakeHeaderStage({ pathName: '/landing/index.html' });
    const link = {
      tagName: 'A',
      href: 'https://example.test/landing/screens.html#shot-01',
      target: '_blank',
      getAttribute: (name) => (name === 'target' ? '_blank' : null),
      hasAttribute: (name) => name === 'target',
    };

    const event = stage.fireClick(link);
    expect(event.defaultPrevented).toBe(true);
    expect(stage.classes.has('header-swap-out')).toBe(true);
    expect(stage.opened).toBeNull();
    expect(stage.store.get(LANDING_HEADER_SWAP.KEY)).toBeUndefined();
    const cross = Number(stage.localStore.get(LANDING_HEADER_SWAP.KEY));
    expect(cross).toBeGreaterThan(0);

    stage.advance(LANDING_HEADER_SWAP.LEAVE_MS);
    expect(stage.opened).toEqual({
      href: 'https://example.test/landing/screens.html#shot-01',
      target: '_blank',
      features: 'noopener,noreferrer',
    });
    expect(stage.classes.has('header-swap-out')).toBe(false);
    expect(stage.navigated).toBeNull();
  });

  test('target=_blank и внешние ссылки не перехватываются', () => {
    const stage = fakeHeaderStage();

    const external = {
      tagName: 'A',
      href: 'https://github.com/SlavaKlkv/photo_metadata_ai',
      target: '_blank',
      getAttribute: (name) => (name === 'target' ? '_blank' : null),
      hasAttribute: (name) => name === 'target',
    };

    expect(stage.fireClick(external).defaultPrevented).toBe(false);
    expect(stage.classes.has('header-swap-out')).toBe(false);
    expect(stage.opened).toBeNull();
    expect(stage.navigated).toBeNull();
  });

  test('prefers-reduced-motion: без fade и без перехвата', () => {
    const stage = fakeHeaderStage({ reduced: true, headerSwap: true });
    stage.advance(0);
    stage.advance(0);
    expect(stage.classes.has('header-swap-ready')).toBe(false);

    const link = {
      tagName: 'A',
      href: 'https://example.test/landing/index.html',
      target: '',
      hasAttribute: () => false,
    };
    expect(stage.fireClick(link).defaultPrevented).toBe(false);
  });

  test('якорь на той же странице не перехватывается (шапка не гаснет)', () => {
    const stage = fakeHeaderStage({ pathName: '/landing/index.html' });
    const link = {
      tagName: 'A',
      href: 'https://example.test/landing/index.html#features',
      target: '',
      hasAttribute: () => false,
    };
    expect(stage.fireClick(link).defaultPrevented).toBe(false);
    expect(stage.classes.has('header-swap-out')).toBe(false);
    expect(stage.navigated).toBeNull();
  });
});

// Контракт: peer-клик; early читает session + localStorage (новая вкладка).
test.each(['index.html', 'screens.html'])(
  '%s: ранний маркер session/local, без Navigation API',
  (filename) => {
    const html = fs.readFileSync(path.join(landingDir, filename), 'utf8');

    expect(html).toContain("sessionStorage.getItem('landing-header-swap')");
    expect(html).toContain("localStorage.getItem('landing-header-swap')");
    expect(html).toContain("classList.add('header-swap')");
    expect(html).toContain('<script src="header-swap.js"></script>');
    expect(html).toMatch(/Date\.now\(\) - n < 5000/);
    expect(html).not.toContain("sessionStorage.getItem('landing-last-page')");
    expect(html).not.toContain('navigation.addEventListener');
    expect(html).toMatch(/html\.header-swap \.nav > :not\(\.brand\)/);
    expect(html).toMatch(
      /html\.header-swap\.header-swap-ready \.nav > :not\(\.brand\):not\(\.nav-cta\)/
    );
    expect(html).toMatch(/html\.header-swap-out \.nav > :not\(\.brand\)/);
    expect(html).not.toContain('@view-transition');
  }
);

test('главная: nav-cta только opacity, без full fade шапки', () => {
  const html = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
  expect(html).toMatch(/<header class="hero-cta-visible">/);
  expect(html).toContain("root.classList.add('nav-cta-ready')");
  expect(html).toContain('function ctaInView');
  expect(html).toContain("header.classList.toggle('hero-cta-visible'");
  expect(html).toMatch(
    /\.nav-cta\s*{[^}]*transition:\s*none/s
  );
  expect(html).toMatch(
    /html\.nav-cta-ready \.nav-cta\s*{[^}]*transition:\s*opacity/s
  );
  expect(html).toMatch(
    /html\.header-swap\.header-swap-ready header\.hero-cta-visible \.nav-cta\s*{[^}]*opacity:\s*0/s
  );
});

test('ссылки на screens.html с главной — target=_blank', () => {
  const html = fs.readFileSync(path.join(landingDir, 'index.html'), 'utf8');
  const screensAnchors = [...html.matchAll(/<a\b[^>]*href="screens\.html[^"]*"[^>]*>/g)].map(
    (m) => m[0]
  );

  expect(screensAnchors.length).toBeGreaterThanOrEqual(5);
  for (const tag of screensAnchors) {
    expect(tag).toMatch(/target="_blank"/);
    expect(tag).toMatch(/rel="noopener"/);
  }
});

test('header-swap.js: blank peer через open + localStorage mark', () => {
  const src = fs.readFileSync(path.join(landingDir, 'header-swap.js'), 'utf8');
  expect(src).toContain('landingHeaderMarkCross');
  expect(src).toContain('localStorage.setItem');
  expect(src).toContain("win.open(href, '_blank'");
  expect(src).not.toContain('LAST_KEY');
  expect(src).not.toContain('win.navigation');
});
