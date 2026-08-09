'use strict';

// Единственный ответчик на вопрос «указатель сейчас на бренде?».
//
// Вопрос неочевидный ровно в одном месте — сразу после перехода index ↔ screens.
// Документ сменился, а курсор нет: браузер пересобирает hover и присылает
// mouseleave, хотя мышь не двигалась; :hover пуст до первого движения; а сам
// бренд в это время скрыт под header-swap и едет FLIP-ом, так что и
// elementFromPoint его не находит. Поэтому на время прибытия ответ даёт не
// hit-test, а геометрия: зона из места бренда на покинутой странице и его места
// здесь. Точка внутри зоны — курсор с логотипа не уходил.

// Точка внутри layout-rect (без transform), с допуском по краю.
function brandIrisPointInRect(px, py, rect, pad) {
  if (typeof px !== 'number' || typeof py !== 'number' || !rect) return false;
  var slack = pad || 0;
  return (
    px >= rect.left - slack &&
    px <= rect.right + slack &&
    py >= rect.top - slack &&
    py <= rect.bottom + slack
  );
}

// Был ли указатель над брендом: elementFromPoint учитывает transform (FLIP),
// :hover сразу после document load — нет.
function brandIrisPointerOverBrand(doc, brand, px, py) {
  if (typeof px !== 'number' || typeof py !== 'number') return false;
  if (doc.elementFromPoint) {
    try {
      var el = doc.elementFromPoint(px, py);
      while (el && el !== doc) {
        if (el === brand) return true;
        el = el.parentNode || el.parentElement;
      }
    } catch (err) {
      /* some hosts throw for out-of-viewport */
    }
  }
  if (brand.getBoundingClientRect) {
    return brandIrisPointInRect(px, py, brand.getBoundingClientRect());
  }
  return false;
}

// Прямоугольник, охватывающий оба: место бренда до перехода и после.
function brandIrisUnionRect(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function createBrandPresence(doc, win, brand) {
  var pointerX = null;
  var pointerY = null;
  var zone = null; // задана только пока идёт прибытие

  function track(event) {
    if (!event) return;
    if (typeof event.clientX === 'number') pointerX = event.clientX;
    if (typeof event.clientY === 'number') pointerY = event.clientY;
  }

  function pointX(px) {
    return typeof px === 'number' ? px : pointerX;
  }

  function pointY(py) {
    return typeof py === 'number' ? py : pointerY;
  }

  // Обычная проверка: hover браузера, иначе hit-test по точке.
  function overNow(px, py) {
    if (brand.matches && brand.matches(':hover')) return true;
    return brandIrisPointerOverBrand(doc, brand, pointX(px), pointY(py));
  }

  // Главный предикат. Во время прибытия судит зона, дальше — обычная проверка.
  // null означает «неизвестно»: координат ещё не было и hover пуст.
  function isOver(px, py) {
    var x = pointX(px);
    var y = pointY(py);
    if (!zone) return overNow(x, y);
    if (brand.matches && brand.matches(':hover')) return true;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return brandIrisPointInRect(x, y, zone, BRAND_IRIS.ZONE_PAD);
  }

  // savedRect — место бренда на покинутой странице, hereRect — здесь (до FLIP).
  function openArrival(savedRect, hereRect) {
    zone = brandIrisUnionRect(savedRect, hereRect);
    return zone;
  }

  function closeArrival() {
    zone = null;
  }

  return {
    track: track,
    isOver: isOver,
    overNow: overNow,
    openArrival: openArrival,
    closeArrival: closeArrival,
    arriving: function () {
      return Boolean(zone);
    },
    zone: function () {
      return zone;
    },
    point: function () {
      return { x: pointerX, y: pointerY };
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    brandIrisPointInRect: brandIrisPointInRect,
    brandIrisPointerOverBrand: brandIrisPointerOverBrand,
    brandIrisUnionRect: brandIrisUnionRect,
    createBrandPresence: createBrandPresence,
  };
  Object.keys(module.exports).forEach(function (name) {
    globalThis[name] = module.exports[name];
  });
}
