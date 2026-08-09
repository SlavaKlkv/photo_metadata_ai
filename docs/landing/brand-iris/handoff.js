'use strict';

// Передача состояния между index.html и screens.html: страницы — отдельные
// документы, и без этого метка на новой странице возникала бы в покое и на
// другой высоте (у главной шапка на узких экранах выше).
//
// Храним место бренда, положение лепестков, цель хода (клик уводит быстрее,
// чем затвор захлопнется) и последнюю точку указателя: :hover после полной
// навигации браузер не выставляет, пока мышь не сдвинется, а координаты
// остаются верными.

function brandIrisSaveHandoff(win, rect, value, target, pointer) {
  var payload = {
    x: rect.left,
    y: rect.top,
    t: value,
    to: target,
    at: Date.now(),
  };
  if (pointer) {
    if (typeof pointer.px === 'number') payload.px = pointer.px;
    if (typeof pointer.py === 'number') payload.py = pointer.py;
    if (pointer.over) payload.over = 1;
  }
  var raw = JSON.stringify(payload);
  try {
    win.sessionStorage.setItem(BRAND_IRIS.HANDOFF_KEY, raw);
  } catch (err) {
    /* storage недоступен */
  }
  // Новая вкладка (target=_blank) не видит sessionStorage — дублируем.
  try {
    win.localStorage.setItem(BRAND_IRIS.HANDOFF_KEY, raw);
  } catch (err2) {
    /* private mode / quota */
  }
}

function brandIrisTakeHandoff(win) {
  var raw = null;
  try {
    raw = win.sessionStorage.getItem(BRAND_IRIS.HANDOFF_KEY);
    win.sessionStorage.removeItem(BRAND_IRIS.HANDOFF_KEY);
  } catch (err) {
    raw = null;
  }
  if (!raw) {
    try {
      raw = win.localStorage.getItem(BRAND_IRIS.HANDOFF_KEY);
      win.localStorage.removeItem(BRAND_IRIS.HANDOFF_KEY);
    } catch (err2) {
      return null;
    }
  } else {
    // session взяли — подчистить cross-tab дубль.
    try {
      win.localStorage.removeItem(BRAND_IRIS.HANDOFF_KEY);
    } catch (err3) {
      /* ignore */
    }
  }
  if (!raw) return null;
  var saved = null;
  try {
    saved = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!saved || typeof saved.at !== 'number') return null;
  // Чужая или засохшая запись (вкладку открыли заново, ушли и вернулись позже).
  if (Date.now() - saved.at > BRAND_IRIS.HANDOFF_TTL) return null;
  return saved;
}

// Бренд доезжает на новое место: ставим в координаты прошлой страницы
// (без transition), снимаем сдвиг после кадра появления header-swap.
function brandIrisTravel(el, dx, dy, win) {
  if (!el.style || (!dx && !dy)) return;
  el.style.transition = 'none';
  el.style.willChange = 'transform';
  el.style.transform =
    'translate(' + brandIrisRound(dx) + 'px, ' + brandIrisRound(dy) + 'px)';
  win.requestAnimationFrame(function () {
    win.requestAnimationFrame(function () {
      el.style.transition =
        'transform ' + BRAND_IRIS.TRAVEL_MS + 'ms cubic-bezier(.22, .8, .3, 1)';
      el.style.transform = '';
      if (win.setTimeout) {
        win.setTimeout(function () {
          el.style.willChange = '';
          el.style.transition = '';
        }, BRAND_IRIS.TRAVEL_MS + 40);
      }
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    brandIrisSaveHandoff: brandIrisSaveHandoff,
    brandIrisTakeHandoff: brandIrisTakeHandoff,
    brandIrisTravel: brandIrisTravel,
  };
  Object.keys(module.exports).forEach(function (name) {
    globalThis[name] = module.exports[name];
  });
}
