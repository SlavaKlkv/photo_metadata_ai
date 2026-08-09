'use strict';

// Ход механизма во времени: характер каждой фазы и покадровая отрисовка пути.
// Модуль знает только про один <path> и requestAnimationFrame.

// Спуск: боевая пружина срывается сразу и гасится об упор — резкий старт,
// короткое торможение в конце и никакого перелёта.
function brandIrisEaseShut(x) {
  var p = 1 - x;
  return 1 - p * p * p;
}

// Раскрытие при наведении: механизм ведут плавно, без рывка на обоих краях.
function brandIrisEaseOpen(x) {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

// Возврат в покой: возвратная пружина проскакивает положение покоя и садится
// обратно — отверстие на мгновение шире, чем в состоянии покоя.
function brandIrisEaseRest(x) {
  var c1 = 1.2;
  var c3 = c1 + 1;
  var p = x - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

// Управление одной меткой: pathEl — путь внутри .brand-mark.
function createBrandIris(pathEl, win) {
  var value = 0;
  var from = 0;
  var to = 0;
  var startedAt = 0;
  var duration = 0;
  var ease = brandIrisEaseShut;
  var frame = 0;

  function render(v) {
    pathEl.setAttribute('d', brandIrisPath(v));
  }

  function step(now) {
    var limit = BRAND_IRIS.LIMIT;
    var p = duration > 0 ? Math.min(1, (now - startedAt) / duration) : 1;
    value = Math.max(-limit, Math.min(limit, from + (to - from) * ease(p)));
    render(value);
    frame = p < 1 ? win.requestAnimationFrame(step) : 0;
  }

  // target: −1 — раскрыть, 0 — вернуть в покой, +1 — закрыть затвор.
  function animate(target) {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    from = value;
    to = target;
    if (from === to) return;
    var base = BRAND_IRIS.OPEN_MS;
    ease = brandIrisEaseOpen;
    if (to > 0) {
      base = BRAND_IRIS.SHUT_MS;
      ease = brandIrisEaseShut;
    } else if (to === 0) {
      base = BRAND_IRIS.REST_MS;
      ease = brandIrisEaseRest;
    }
    // Короткий путь проходится быстрее: возврат курсора на полпути не должен
    // выглядеть медленнее, чем полный ход.
    var span = Math.max(0.35, Math.min(1, Math.abs(to - from)));
    duration = base * span;
    startedAt = win.performance && win.performance.now ? win.performance.now() : Date.now();
    frame = win.requestAnimationFrame(step);
  }

  // Мгновенная установка положения: нужна на другой странице, чтобы затвор
  // продолжил ход с того места, где его застал переход.
  function set(v) {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    value = Math.max(-BRAND_IRIS.LIMIT, Math.min(BRAND_IRIS.LIMIT, v));
    render(value);
  }

  return {
    animate: animate,
    set: set,
    reset: function () {
      set(0);
    },
    value: function () {
      return value;
    },
    target: function () {
      return frame ? to : value;
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    brandIrisEaseShut: brandIrisEaseShut,
    brandIrisEaseOpen: brandIrisEaseOpen,
    brandIrisEaseRest: brandIrisEaseRest,
    createBrandIris: createBrandIris,
  };
  Object.keys(module.exports).forEach(function (name) {
    globalThis[name] = module.exports[name];
  });
}
