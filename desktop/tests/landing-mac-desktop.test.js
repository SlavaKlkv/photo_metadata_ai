'use strict';

const fs = require('fs');
const path = require('path');
const { isMacDesktop, applyMacDesktopClass } = require('../../docs/landing/mac-desktop.js');

const landingPath = path.resolve(__dirname, '../../docs/landing/index.html');
const screensPath = path.resolve(__dirname, '../../docs/landing/screens.html');

function fakeRoot() {
  const classes = new Set();
  return {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

describe('isMacDesktop', () => {
  test('настоящий Mac: platform MacIntel без тача', () => {
    expect(
      isMacDesktop({
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 0,
      }),
    ).toBe(true);
  });

  test('Chrome userAgentData.platform === macOS', () => {
    expect(
      isMacDesktop({
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0',
        maxTouchPoints: 0,
        userAgentData: { platform: 'macOS' },
      }),
    ).toBe(true);
  });

  test('Windows через userAgentData — не Mac', () => {
    expect(
      isMacDesktop({
        platform: 'Win32',
        userAgent: 'Mozilla/5.0',
        maxTouchPoints: 0,
        userAgentData: { platform: 'Windows' },
      }),
    ).toBe(false);
  });

  test('iPad с desktop UA (MacIntel + touch) — не Mac', () => {
    expect(
      isMacDesktop({
        platform: 'MacIntel',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  test('iPhone — не Mac', () => {
    expect(
      isMacDesktop({
        platform: 'iPhone',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  test('Android — не Mac', () => {
    expect(
      isMacDesktop({
        platform: 'Linux armv8l',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
        maxTouchPoints: 5,
        userAgentData: { platform: 'Android' },
      }),
    ).toBe(false);
  });
});

describe('applyMacDesktopClass', () => {
  test('ставит is-mac / not-mac', () => {
    const macRoot = fakeRoot();
    expect(
      applyMacDesktopClass(macRoot, {
        platform: 'MacIntel',
        userAgent: 'Macintosh',
        maxTouchPoints: 0,
      }),
    ).toBe(true);
    expect(macRoot.classList.contains('is-mac')).toBe(true);
    expect(macRoot.classList.contains('not-mac')).toBe(false);

    const winRoot = fakeRoot();
    expect(
      applyMacDesktopClass(winRoot, {
        platform: 'Win32',
        userAgent: 'Windows',
        maxTouchPoints: 0,
        userAgentData: { platform: 'Windows' },
      }),
    ).toBe(false);
    expect(winRoot.classList.contains('is-mac')).toBe(false);
    expect(winRoot.classList.contains('not-mac')).toBe(true);
  });
});

describe('лендинг прячет .dmg через not-mac, не через ширину', () => {
  test.each([
    ['index.html', landingPath],
    ['screens.html', screensPath],
  ])('%s: mac-desktop.js в head до стилей, правило html.not-mac', (_name, filePath) => {
    const html = fs.readFileSync(filePath, 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    const scriptAt = head.indexOf('mac-desktop.js');
    const styleAt = head.indexOf('<style>');

    expect(scriptAt).toBeGreaterThan(-1);
    expect(styleAt).toBeGreaterThan(scriptAt);
    expect(html).toMatch(
      /html\.not-mac a\[href\*=["']\/releases\/download\/["']\][\s\S]*?display:\s*none\s*!important/s,
    );

    // Ширина больше не прячет .dmg — иначе iPad landscape / узкий Mac врёт.
    const blocks860 = [...html.matchAll(/@media \(max-width: 860px\) \{([\s\S]*?)\n  \}/g)];
    for (const block of blocks860) {
      expect(block[1]).not.toMatch(/releases\/download/);
      expect(block[1]).not.toMatch(/\.cta-note/);
    }
  });

  test('index: cta-note тоже только на Mac', () => {
    const html = fs.readFileSync(landingPath, 'utf8');
    expect(html).toMatch(/html\.not-mac \.cta-note[\s\S]*?display:\s*none\s*!important/s);
  });
});
