'use strict';

// Плавная смена пунктов шапки между index.html и screens.html.
// View Transition API не используем — в Chrome он вспыхивал при возврате.
//
// 1) Клик peer в той же вкладке: fade-out → navigate (LEAVE_MS) → fade-in.
// 2) target=_blank peer (галерея с главной): fade-out на исходной → open →
//    вернуть шапку; на новой вкладке enter по localStorage (sessionStorage
//    не шарится между вкладками).
// 3) Back/F5 — без fade.
// 4) In-page (якоря, .nav-cta) — full fade шапки нет.
//
// Подключение (оба HTML):
//   <script>/* early: class header-swap */</script>
//   <script src="brand-iris/…"></script>
//   <script src="header-swap.js"></script>

var LANDING_HEADER_SWAP = {
  KEY: 'landing-header-swap',
  // Один key в sessionStorage (та же вкладка) и localStorage (новая вкладка).
  // localStorage-значение — timestamp; early читает TTL.
  CROSS_TTL_MS: 5000,
  LEAVE_MS: 220,
  ENTER_MS: 320,
};

function landingHeaderPageKey(pathname) {
  var path = String(pathname || '').replace(/\/+$/, '');
  var end = path.split('/').pop() || '';
  if (!end || end === 'landing' || end === 'index.html') return 'index';
  if (end === 'screens.html') return 'screens';
  return null;
}

function landingHeaderIsPeer(fromPath, toHref, baseHref) {
  var to;
  try {
    to = new URL(toHref, baseHref || 'https://example.test/');
  } catch (err) {
    return false;
  }
  var fromKey = landingHeaderPageKey(fromPath);
  var toKey = landingHeaderPageKey(to.pathname);
  return Boolean(fromKey && toKey && fromKey !== toKey);
}

function landingHeaderReduced(win) {
  return Boolean(
    win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Та же вкладка: sessionStorage flag.
function landingHeaderMark(win) {
  try {
    win.sessionStorage.setItem(LANDING_HEADER_SWAP.KEY, '1');
  } catch (err) {
    /* storage недоступен */
  }
}

// Новая вкладка: localStorage + timestamp (sessionStorage не шарится).
function landingHeaderMarkCross(win) {
  try {
    win.localStorage.setItem(LANDING_HEADER_SWAP.KEY, String(Date.now()));
  } catch (err) {
    /* storage недоступен */
  }
}

function landingHeaderIsBlankTarget(node) {
  if (!node) return false;
  if (node.target === '_blank') return true;
  return (
    typeof node.getAttribute === 'function' && node.getAttribute('target') === '_blank'
  );
}

function initLandingHeaderSwap(doc, win) {
  if (!doc || !win || !doc.documentElement) return;

  var root = doc.documentElement;
  var reduced = landingHeaderReduced(win);
  var leaving = false;

  // Fade-in: ранний скрипт поставил .header-swap (session или local mark).
  if (!reduced && root.classList && root.classList.contains('header-swap')) {
    win.requestAnimationFrame(function () {
      win.requestAnimationFrame(function () {
        root.classList.add('header-swap-ready');
      });
    });
    if (win.setTimeout) {
      win.setTimeout(function () {
        root.classList.remove('header-swap', 'header-swap-ready');
      }, LANDING_HEADER_SWAP.ENTER_MS + 80);
    }
  }

  win.addEventListener('pageshow', function (event) {
    if (event && event.persisted) {
      root.classList.remove('header-swap-out', 'header-swap', 'header-swap-ready');
      leaving = false;
    }
  });

  if (reduced || !doc.addEventListener) return;

  doc.addEventListener(
    'click',
    function (event) {
      if (leaving) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var node = event.target;
      while (node && node !== doc && !(node.tagName === 'A' && node.href)) {
        node = node.parentNode;
      }
      if (!node || node.tagName !== 'A') return;
      if (node.hasAttribute('download')) return;
      if (!landingHeaderIsPeer(win.location.pathname, node.href, win.location.href)) {
        return;
      }

      event.preventDefault();
      leaving = true;
      root.classList.add('header-swap-out');

      var href = node.href;
      var blank = landingHeaderIsBlankTarget(node);

      if (blank) {
        // Enter на новой вкладке + handoff brand через localStorage.
        landingHeaderMarkCross(win);
        // sessionStorage handoff написать успеет brand-iris (freeze по swap-out);
        // brandIrisSaveHandoff также пишет localStorage.
        var openBlank = function () {
          if (typeof win.open === 'function') {
            win.open(href, '_blank', 'noopener,noreferrer');
          } else {
            win.location.href = href;
          }
          // Исходная вкладка остаётся: вернуть шапку и снять leave.
          root.classList.remove('header-swap-out');
          leaving = false;
        };
        if (win.setTimeout) {
          win.setTimeout(openBlank, LANDING_HEADER_SWAP.LEAVE_MS);
        } else {
          openBlank();
        }
        return;
      }

      landingHeaderMark(win);
      var go = function () {
        win.location.href = href;
      };
      if (win.setTimeout) {
        win.setTimeout(go, LANDING_HEADER_SWAP.LEAVE_MS);
      } else {
        go();
      }
    },
    true
  );
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initLandingHeaderSwap(document, window);
    });
  } else {
    initLandingHeaderSwap(document, window);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LANDING_HEADER_SWAP: LANDING_HEADER_SWAP,
    landingHeaderPageKey: landingHeaderPageKey,
    landingHeaderIsPeer: landingHeaderIsPeer,
    landingHeaderMark: landingHeaderMark,
    landingHeaderMarkCross: landingHeaderMarkCross,
    landingHeaderIsBlankTarget: landingHeaderIsBlankTarget,
    initLandingHeaderSwap: initLandingHeaderSwap,
  };
}
