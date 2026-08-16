'use strict';

// Десктоп: 16 искр занимают 4×4 ячейки; intro внахлёст переходит в рабочий цикл.
// Touch/coarse: отдельная система без intro — одна редкая одноразовая вспышка.

function brandSparklesReduced(win) {
  try {
    return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (err) {
    return false;
  }
}

function brandSparklesPageKey(win, doc) {
  var path = (win && win.location && win.location.pathname) || '';
  if (/screens\.html(?:$|[?#])/.test(path)) return 'screens';
  // Без pathname (тесты / file://) — как и intro: бейдж есть только на главной.
  if (doc && doc.querySelector && !doc.querySelector('.hero-copy > .badge')) {
    return 'screens';
  }
  return 'index';
}

function brandSparklesGetFlags(doc, win) {
  var getFlags =
    (win && typeof win.getLandingParticleFlags === 'function' && win.getLandingParticleFlags) ||
    (typeof getLandingParticleFlags === 'function' ? getLandingParticleFlags : null);
  if (!getFlags) return null;
  try {
    return getFlags(brandSparklesPageKey(win, doc));
  } catch (err) {
    return null;
  }
}

function brandSparklesEnabled(doc, win) {
  var flags = brandSparklesGetFlags(doc, win);
  if (!flags) return true;
  return !!flags.ENABLE_BRAND_SPARKLES;
}

// Реестры режимов. Новый intro / working: добавить сюда runner и указать id во флагах.
// false во флагах — режим выключен. Неизвестный id тоже выключает (без падения).
var BRAND_SPARKLES_INTRO_MODES = {
  flow: function (win, layer, doc, ctx) {
    brandSparklesRunIntro(win, layer, doc, ctx);
  },
};

var BRAND_SPARKLES_WORKING_MODES = {
  flow: function (win, layer, doc) {
    brandSparklesStartWorkingLoop(layer, win, doc);
  },
  'twinkle-pairs': function (win, layer, doc) {
    brandSparklesStartDesktopTwinkles(doc, win, layer);
  },
};

function brandSparklesResolveMode(value, registry) {
  if (value === true) value = 'flow';
  if (value === false || value == null || value === '' || value === 'none') return null;
  if (typeof value !== 'string') return null;
  return registry[value] ? value : null;
}

function brandSparklesModes(doc, win) {
  var flags = brandSparklesGetFlags(doc, win);
  // Без файла флагов — как раньше: intro на главной (бейдж), рабочий цикл всегда.
  if (!flags) {
    var hasBadge = Boolean(doc && doc.querySelector && doc.querySelector('.hero-copy > .badge'));
    return {
      intro: hasBadge ? 'flow' : null,
      working: 'flow',
    };
  }
  return {
    intro: brandSparklesResolveMode(flags.BRAND_SPARKLES_INTRO, BRAND_SPARKLES_INTRO_MODES),
    working: brandSparklesResolveMode(flags.BRAND_SPARKLES_WORKING, BRAND_SPARKLES_WORKING_MODES),
  };
}

function brandSparklesFreezeLayer(layer) {
  if (!layer) return;
  var stars = layer.querySelectorAll('.brand-sparkle');
  Array.prototype.forEach.call(stars, function (star) {
    if (star.classList) star.classList.add('is-restarting');
    star.style.animation = 'none';
    star.style.opacity = '0';
  });
}

function brandSparklesRegisterIntroMode(id, runner) {
  if (typeof id !== 'string' || !id || typeof runner !== 'function') return false;
  BRAND_SPARKLES_INTRO_MODES[id] = runner;
  return true;
}

function brandSparklesRegisterWorkingMode(id, runner) {
  if (typeof id !== 'string' || !id || typeof runner !== 'function') return false;
  BRAND_SPARKLES_WORKING_MODES[id] = runner;
  return true;
}

// На таче старая система (intro и рабочий цикл) даёт дрожь композитора.
// Там работает отдельная редкая анимация одной искры.
function brandSparklesMobile(win) {
  try {
    return Boolean(win.matchMedia && win.matchMedia('(hover: none), (pointer: coarse)').matches);
  } catch (err) {
    return false;
  }
}

function brandSparklesRemoveLayer(layer) {
  if (!layer) return;
  if (typeof layer.remove === 'function') {
    layer.remove();
    return;
  }
  var parent = layer.parentNode;
  if (parent && parent.removeChild) parent.removeChild(layer);
}

function brandSparklesIsSwapArrival(doc) {
  return Boolean(
    doc.documentElement &&
      doc.documentElement.classList &&
      doc.documentElement.classList.contains('header-swap')
  );
}

function brandSparklesRand(win) {
  var m = win && win.Math ? win.Math : Math;
  return typeof m.random === 'function' ? m.random() : Math.random();
}

function brandSparklesShuffle(list, win) {
  var result = Array.prototype.slice.call(list);
  for (var i = result.length - 1; i > 0; i--) {
    var j = Math.floor(brandSparklesRand(win) * (i + 1));
    var item = result[i];
    result[i] = result[j];
    result[j] = item;
  }
  return result;
}

// Небольшой наклон: искра остаётся узнаваемым знаком «сгенерировано», а не
// произвольно повёрнутым кристаллом.
function brandSparklesTilt(win) {
  return Math.round(-12 + brandSparklesRand(win) * 24) + 'deg';
}

// Фронт входит с периметра.
// 0–3 — стороны: направленный проход через зону.
// 4–7 — углы (СЗ, СВ, ЮВ, ЮЗ): generative bloom из угла или с соседней
// границы у угла. Это AI-эффект раскрытия, без цели «переместиться к
// противоположному углу».
function brandSparklesSweepFlow(win, edge) {
  if (edge >= 4) {
    var corner = edge;
    var place = brandSparklesRand(win);
    var inset = 4 + brandSparklesRand(win) * 24;
    var sourceX;
    var sourceY;
    if (corner === 4) {
      // СЗ: угол / верх у левого / левый у верха.
      if (place < 1 / 3) {
        sourceX = -12;
        sourceY = -12;
      } else if (place < 2 / 3) {
        sourceX = inset;
        sourceY = -12;
      } else {
        sourceX = -12;
        sourceY = inset;
      }
    } else if (corner === 5) {
      if (place < 1 / 3) {
        sourceX = 112;
        sourceY = -12;
      } else if (place < 2 / 3) {
        sourceX = 100 - inset;
        sourceY = -12;
      } else {
        sourceX = 112;
        sourceY = inset;
      }
    } else if (corner === 6) {
      if (place < 1 / 3) {
        sourceX = 112;
        sourceY = 112;
      } else if (place < 2 / 3) {
        sourceX = 100 - inset;
        sourceY = 112;
      } else {
        sourceX = 112;
        sourceY = 100 - inset;
      }
    } else {
      if (place < 1 / 3) {
        sourceX = -12;
        sourceY = 112;
      } else if (place < 2 / 3) {
        sourceX = inset;
        sourceY = 112;
      } else {
        sourceX = -12;
        sourceY = 100 - inset;
      }
    }
    return { mode: 'bloom', edge: corner, sourceX: sourceX, sourceY: sourceY };
  }

  var flow = { mode: 'sweep', edge: edge };
  var entry = 8 + brandSparklesRand(win) * 84;
  var exitAlong = 8 + brandSparklesRand(win) * 84;
  if (edge === 0) {
    flow.sourceX = -12;
    flow.sourceY = entry;
    flow.targetX = 112;
    flow.targetY = exitAlong;
  } else if (edge === 1) {
    flow.sourceX = 112;
    flow.sourceY = entry;
    flow.targetX = -12;
    flow.targetY = exitAlong;
  } else if (edge === 2) {
    flow.sourceX = entry;
    flow.sourceY = -12;
    flow.targetX = exitAlong;
    flow.targetY = 112;
  } else {
    flow.sourceX = entry;
    flow.sourceY = 112;
    flow.targetX = exitAlong;
    flow.targetY = -12;
  }

  var dx = flow.targetX - flow.sourceX;
  var dy = flow.targetY - flow.sourceY;
  var length = Math.sqrt(dx * dx + dy * dy) || 1;
  flow.directionX = dx / length;
  flow.directionY = dy / length;
  return flow;
}

function brandSparklesBloomFlow(win) {
  return {
    mode: 'bloom',
    sourceX: brandSparklesRand(win) * 100,
    sourceY: brandSparklesRand(win) * 100,
  };
}

// Один случайный flow-план управляет всем intro. В начале потока источник
// выбирается 50/50: с периметра (стороны и углы) или из любой точки зоны.
// Направление меняется между загрузками, но внутри одного intro точки
// остаются частями одного процесса.
function brandSparklesCreateIntroFlow(win) {
  if (brandSparklesRand(win) < 0.5) return brandSparklesBloomFlow(win);
  return brandSparklesSweepFlow(win, Math.floor(brandSparklesRand(win) * 8) % 8);
}

// Рабочий курс в начале потока 50/50: с периметра или из любой точки зоны.
// На периметре нет чистых боковых проходов (слева/справа): в низкой рабочей
// зоне они читаются как маятник. Остаются верх/низ и угловые bloom.
// Одинаковый рисунок подряд не повторяем.
function brandSparklesCreateWorkingFlow(win, previousFlow) {
  // Внутренний bloom (без edge) не идёт сразу после такого же: иначе AI-раскрытие
  // из точки зоны дублируется. Угловой bloom помечен edge 4–7 и в эту паузу
  // не попадает.
  var wasInteriorBloom =
    previousFlow && previousFlow.mode === 'bloom' && !Number.isFinite(previousFlow.edge);
  if (!wasInteriorBloom && brandSparklesRand(win) < 0.5) return brandSparklesBloomFlow(win);

  // 2 — сверху, 3 — снизу, 4–7 — углы. Без 0/1 (лево/право).
  var edges = [2, 3, 4, 5, 6, 7];
  if (previousFlow && Number.isFinite(previousFlow.edge)) {
    edges = edges.filter(function (edge) {
      return edge !== previousFlow.edge;
    });
  }
  return brandSparklesSweepFlow(
    win,
    edges[Math.floor(brandSparklesRand(win) * edges.length) % edges.length]
  );
}

// Возвращает ранг каждой исходной точки вдоль общего flow-плана. aspect —
// высота зоны к её ширине: intro-зона выше рабочей, поэтому один и тот же
// вектор в процентах даёт в них разный визуальный угол. Ранг считается в
// пропорциях пикселей, и поток читается одинаково в обеих зонах.
function brandSparklesIntroOrder(stars, flow, aspect) {
  var aspectY = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  var dirX = flow.directionX;
  var dirY = flow.directionY;
  if (flow.mode !== 'bloom' && Number.isFinite(flow.targetX)) {
    var vx = flow.targetX - flow.sourceX;
    var vy = (flow.targetY - flow.sourceY) * aspectY;
    var vlen = Math.sqrt(vx * vx + vy * vy) || 1;
    dirX = vx / vlen;
    dirY = vy / vlen;
  }

  var ranked = Array.prototype.map.call(stars, function (star, index) {
    var x = Number.parseFloat(star.style.getPropertyValue('--x'));
    var y = Number.parseFloat(star.style.getPropertyValue('--y'));
    if (!Number.isFinite(x)) x = 50 + index;
    if (!Number.isFinite(y)) y = 50;
    var dx = x - flow.sourceX;
    var dy = (y - flow.sourceY) * aspectY;
    var score;
    if (flow.mode === 'bloom') {
      score = Math.sqrt(dx * dx + dy * dy);
    } else {
      // Небольшой штраф за удаление от оси слегка изгибает фронт, но не
      // разрушает ощущение направленного потока.
      var along = dx * dirX + dy * dirY;
      var across = Math.abs(dx * -dirY + dy * dirX);
      score = along + across * 0.08;
    }
    return { index: index, score: score, y: y };
  });
  ranked.sort(function (a, b) {
    return a.score - b.score || a.y - b.y || a.index - b.index;
  });
  var order = new Array(ranked.length);
  ranked.forEach(function (item, rank) {
    order[item.index] = rank;
  });
  return order;
}

// Пропорции зоны искр. Инсеты повторяют CSS-правило .brand-sparkles, высота
// intro-зоны — полосу шапки с выходом ниже (см. brandSparklesFitIntroZone).
var BRAND_SPARKLES_ZONE_INSET = { top: 8, right: 20, bottom: 8, left: 16 };

// Верх и высота зоны в пикселях относительно верха локапа. По этим двум
// прямоугольникам одна и та же точка в процентах переводится из intro-зоны в
// рабочую без смещения на экране.
function brandSparklesZoneBox(layer, doc, expanded) {
  var lockup = layer && (layer.parentElement || layer.parentNode);
  if (!lockup || typeof lockup.getBoundingClientRect !== 'function') return null;
  var lock = lockup.getBoundingClientRect();
  var work = {
    top: -BRAND_SPARKLES_ZONE_INSET.top,
    height: lock.height + BRAND_SPARKLES_ZONE_INSET.top + BRAND_SPARKLES_ZONE_INSET.bottom,
    width: lock.width + BRAND_SPARKLES_ZONE_INSET.left + BRAND_SPARKLES_ZONE_INSET.right,
  };
  if (!expanded) return work;

  var header = doc && doc.querySelector ? doc.querySelector('header') : null;
  var head =
    header && typeof header.getBoundingClientRect === 'function'
      ? header.getBoundingClientRect()
      : null;
  if (!head || !head.height) return work;
  return {
    top: head.top - lock.top,
    height: head.height + BRAND_SPARKLES_INTRO_BLEED_PX,
    width: work.width,
  };
}

function brandSparklesZoneAspect(layer, doc, expanded) {
  var box = brandSparklesZoneBox(layer, doc, expanded);
  if (!box || !box.width) return 1;
  return box.height / box.width;
}

// Снимает intro-зону, не сдвинув ни одной видимой искры: их --y пересчитывается
// так, что точка остаётся на том же месте в пикселях. Уже погасшие сразу
// уезжают в рабочую полосу, остальные — сами, при следующем угасании. Поэтому
// возврат зоны к рабочему inset не читается как обрез.
function brandSparklesCollapseZone(layer, doc, win) {
  var intro = brandSparklesZoneBox(layer, doc, true);
  var work = brandSparklesZoneBox(layer, doc, false);
  var stars = Array.prototype.slice.call(layer.querySelectorAll('.brand-sparkle'));
  if (intro && work && work.height) {
    var rows = Math.ceil(stars.length / 4);
    stars.forEach(function (star) {
      var dark =
        win && win.getComputedStyle ? Number(win.getComputedStyle(star).opacity) <= 0.03 : false;
      var cell = Number(star.getAttribute('data-spark-cell'));
      if (dark && Number.isFinite(cell)) {
        brandSparklesPositionInCell(star, cell, rows, win);
        return;
      }
      var percent = Number.parseFloat(star.style.getPropertyValue('--y'));
      if (!Number.isFinite(percent)) return;
      var pixel = intro.top + (percent / 100) * intro.height;
      star.style.setProperty('--y', (((pixel - work.top) / work.height) * 100).toFixed(2) + '%');
    });
  }
  if (layer.classList) layer.classList.remove('is-intro-zone');
}

// Рабочий режим идёт по такому же плану потока, только разбег фаз растянут на
// весь период — поэтому ход спокойнее. Ранги пересчитаны под рабочую зону,
// которая ниже intro-зоны.
function brandSparklesWorkingState(layer, win, stars, existingFlow, aspect) {
  if (layer._brandSparklesWorkingState) return layer._brandSparklesWorkingState;
  var flow = existingFlow || brandSparklesCreateWorkingFlow(win);
  var zoneAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  var order = brandSparklesIntroOrder(stars, flow, zoneAspect);
  var rankByCell = {};
  Array.prototype.forEach.call(stars, function (star, index) {
    rankByCell[Number(star.getAttribute('data-spark-cell'))] = order[index];
  });
  layer._brandSparklesWorkingState = {
    flow: flow,
    aspect: zoneAspect,
    order: order,
    rankByCell: rankByCell,
    cursor: 0,
    events: 0,
  };
  return layer._brandSparklesWorkingState;
}

function brandSparklesRefreshWorkingFlow(layer, win, stars, state) {
  var flow = brandSparklesCreateWorkingFlow(win, state.flow);
  var order = brandSparklesIntroOrder(stars, flow, state.aspect);
  var rankByCell = {};
  Array.prototype.forEach.call(stars, function (star, index) {
    rankByCell[Number(star.getAttribute('data-spark-cell'))] = order[index];
  });
  state.flow = flow;
  state.order = order;
  state.rankByCell = rankByCell;
  state.cursor = 0;
  state.events = 0;
}

function brandSparklesLayout(layer, win) {
  var stars = layer.querySelectorAll('.brand-sparkle');
  if (!stars.length) return [];

  var cols = 4;
  var rows = Math.ceil(stars.length / cols);
  var cells = [];
  for (var i = 0; i < stars.length; i++) cells.push(i);
  cells = brandSparklesShuffle(cells, win);

  Array.prototype.forEach.call(stars, function (star, index) {
    var cell = cells[index];
    var col = cell % cols;
    var row = Math.floor(cell / cols);
    // Запас внутри ячейки не даёт большим звёздам резаться краями слоя.
    var x = ((col + 0.18 + brandSparklesRand(win) * 0.64) / cols) * 100;
    var y = ((row + 0.2 + brandSparklesRand(win) * 0.6) / rows) * 100;
    star.style.setProperty('--x', x.toFixed(2) + '%');
    star.style.setProperty('--y', y.toFixed(2) + '%');
    star.style.setProperty('--rot', brandSparklesTilt(win));
    star.setAttribute('data-spark-cell', String(cell));
  });

  return cells;
}

function brandSparklesPositionInCell(star, cell, rows, win) {
  if (!star || !star.style || !Number.isFinite(cell)) return;
  var cols = 4;
  var col = cell % cols;
  var row = Math.floor(cell / cols);
  var x = ((col + 0.18 + brandSparklesRand(win) * 0.64) / cols) * 100;
  var y = ((row + 0.2 + brandSparklesRand(win) * 0.6) / rows) * 100;
  star.style.setProperty('--x', x.toFixed(2) + '%');
  star.style.setProperty('--y', y.toFixed(2) + '%');
  star.style.setProperty('--rot', brandSparklesTilt(win));
  star.setAttribute('data-spark-cell', String(cell));
}

function brandSparklesRedistributeHidden(layer, win, trigger) {
  var allStars = Array.prototype.slice.call(layer.querySelectorAll('.brand-sparkle'));
  var stars = allStars.filter(function (star) {
    return !/\bbrand-sparkle-extra\b/.test(star.className || '');
  });
  if (!stars.length) return [];
  // Временные intro-искры не входят в постоянный поток: они исчезнут после
  // подхвата и не должны сбивать его курсор или занимать его ячейки.
  if (/\bbrand-sparkle-extra\b/.test((trigger && trigger.className) || '')) {
    var extraCell = Number(trigger.getAttribute('data-spark-cell'));
    brandSparklesPositionInCell(trigger, extraCell, Math.ceil(stars.length / 4), win);
    return [extraCell];
  }
  var rows = Math.ceil(stars.length / 4);
  var hidden = stars.filter(function (star) {
    if (star === trigger) return true;
    if (!win.getComputedStyle) return false;
    return Number(win.getComputedStyle(star).opacity) <= 0.03;
  });
  if (!hidden.length) hidden = [trigger];

  var state = brandSparklesWorkingState(layer, win, stars);
  // Одно направление живёт один полный проход, затем берётся новый план.
  // Новый включается по одной искре, поэтому рисунок не перестраивается рывком.
  if (state.events >= stars.length) {
    brandSparklesRefreshWorkingFlow(layer, win, stars, state);
  }

  var targetRank = state.cursor % stars.length;
  var target = hidden[0];
  var bestDistance = Infinity;
  hidden.forEach(function (star) {
    var cell = Number(star.getAttribute('data-spark-cell'));
    var rank = state.rankByCell[cell];
    if (!Number.isFinite(rank)) return;
    var distance = (rank - targetRank + stars.length) % stars.length;
    if (distance < bestDistance) {
      bestDistance = distance;
      target = star;
    }
  });

  var triggerCell = Number(trigger.getAttribute('data-spark-cell'));
  var targetCell = Number(target.getAttribute('data-spark-cell'));
  // Меняем только две уже невидимые точки. Остальная композиция не прыгает,
  // а следующая вспышка продолжает прослеживаемую траекторию потока.
  if (target !== trigger && Number.isFinite(triggerCell) && Number.isFinite(targetCell)) {
    brandSparklesPositionInCell(target, triggerCell, rows, win);
  }
  brandSparklesPositionInCell(trigger, targetCell, rows, win);

  state.events += 1;
  // Шаг ровно по одной точке, как в intro: порядок вдоль потока не рвётся.
  state.cursor = (state.cursor + 1) % stars.length;
  return [targetCell];
}

function brandSparklesStartWorkingLoop(layer, win, doc) {
  var stars = Array.prototype.slice.call(layer.querySelectorAll('.brand-sparkle')).filter(
    function (star) {
      return !/\bbrand-sparkle-extra\b/.test(star.className || '');
    }
  );
  if (!stars.length) return [];
  var state = brandSparklesWorkingState(
    layer,
    win,
    stars,
    null,
    brandSparklesZoneAspect(layer, doc, false)
  );
  var step = BRAND_SPARKLES_CYCLE_MS / stars.length;
  stars.forEach(function (star, index) {
    // Все стартуют из погасшего состояния: поток входит с края и заполняет
    // период, а не включается пачкой из середины фазы.
    star.style.setProperty('--delay', Math.round(state.order[index] * step) + 'ms');
  });
  brandSparklesRestartLoop(layer);
  return state.order;
}

function brandSparklesBindMotion(layer, win) {
  var stars = layer.querySelectorAll('.brand-sparkle');
  Array.prototype.forEach.call(stars, function (star) {
    star.addEventListener('animationiteration', function (event) {
      if (!event || event.animationName === 'brand-sparkle-glint') {
        brandSparklesRedistributeHidden(layer, win, star);
      }
    });
  });
}

function brandSparklesRestartLoop(layer) {
  var stars = layer.querySelectorAll('.brand-sparkle');
  Array.prototype.forEach.call(stars, function (star) {
    if (star.classList) star.classList.add('is-restarting');
    star.style.animation = 'none';
  });
  void layer.offsetWidth;
  Array.prototype.forEach.call(stars, function (star) {
    if (star.classList) star.classList.remove('is-restarting');
    star.style.animation = '';
  });
}

function brandSparklesWhenBrandVisible(doc, win, start) {
  var root = doc.documentElement;
  if (!brandSparklesIsSwapArrival(doc)) {
    start();
    return;
  }

  var done = false;
  var mo = null;
  function finish() {
    if (done) return;
    done = true;
    if (mo && mo.disconnect) mo.disconnect();
    start();
  }

  if (win.MutationObserver && root) {
    mo = new win.MutationObserver(function () {
      if (
        !root.classList.contains('header-swap') ||
        root.classList.contains('header-swap-ready')
      ) {
        finish();
      }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  if (root && root.classList.contains('header-swap-ready')) {
    finish();
    return;
  }
  win.setTimeout(finish, 800);
}

// Период glint и момент, когда искра уже полностью погасла (54% цикла).
var BRAND_SPARKLES_CYCLE_MS = 5000;
var BRAND_SPARKLES_DARK_AT_MS = 2750;
// Разбег первых вспышек: достаточно длинный, чтобы тот же AI-flow (проход /
// bloom) читался как процесс, а не как одновременная пачка. Короче рабочего
// периода (5 с), поэтому intro всё ещё плотнее обычного хода.
var BRAND_SPARKLES_APPEAR_SPREAD_MS = 3200;
// Временные искры идут по тому же flow, что и основные, а не вспыхивают
// пачкой в первые сотни мс. Потом одна «подхватывающая» вспышка закрывает
// спад плотности на стыке с рабочим режимом.
var BRAND_SPARKLES_EXTRA_COUNT = 4;
var BRAND_SPARKLES_EXTRA_FILL_AT_MS = 4200;
var BRAND_SPARKLES_EXTRA_FILL_STEP_MS = 400;
var BRAND_SPARKLES_EXTRA_SIZES = ['6px', '8px', '11px'];
// Мобильная искра — короткий одиночный импульс, затем 3–6 с полной тишины.
var BRAND_SPARKLES_MOBILE_FLASH_MS = 900;
var BRAND_SPARKLES_MOBILE_MIN_WAIT_MS = 3000;
var BRAND_SPARKLES_MOBILE_WAIT_RANGE_MS = 3000;
var BRAND_SPARKLES_MOBILE_SIZES = ['8px', '11px'];
// На десктопе в twinkle-pairs всегда крупный знак (как у триад/пар в сетке).
var BRAND_SPARKLES_DESKTOP_TWINKLE_SIZE = '11px';
// Искра не накрывает логотип и надпись. Зазор нулевой: поля рабочей зоны
// всего 8–20px, и любой отступ съедает место для средних и крупных знаков.
var BRAND_SPARKLES_MOBILE_GAP_PX = 0;
// Насколько intro выходит ниже нижней границы шапки. Небольшой выход, без
// «полосы до края»: ниже шапки бока ещё и сужаются clip-path.
var BRAND_SPARKLES_INTRO_BLEED_PX = 16;
var BRAND_SPARKLES_INTRO_SIDE_INSET = 22;

function brandSparklesMobileDelay(win) {
  return (
    BRAND_SPARKLES_MOBILE_MIN_WAIT_MS +
    Math.round(brandSparklesRand(win) * BRAND_SPARKLES_MOBILE_WAIT_RANGE_MS)
  );
}

function brandSparklesIntersectsRect(x, y, size, rect, padding) {
  if (!rect) return false;
  return (
    x + size > rect.left - padding &&
    x < rect.right + padding &&
    y + size > rect.top - padding &&
    y < rect.bottom + padding
  );
}

// Свободные прямоугольники внутри рабочей зоны: поля вокруг логотипа и
// надписи. Так точка всегда находится, если места хватает на выбранный размер.
function brandSparklesMobileFreeRects(zone, excluded, size, gap) {
  if (!zone || !size) return [];
  var brandLeft = Infinity;
  var brandRight = -Infinity;
  var brandTop = Infinity;
  var brandBottom = -Infinity;
  excluded.forEach(function (rect) {
    if (rect.left < brandLeft) brandLeft = rect.left;
    if (rect.right > brandRight) brandRight = rect.right;
    if (rect.top < brandTop) brandTop = rect.top;
    if (rect.bottom > brandBottom) brandBottom = rect.bottom;
  });
  if (!isFinite(brandLeft)) {
    return [{ x: zone.left, y: zone.top, w: zone.width - size, h: zone.height - size }];
  }

  var minX = zone.left;
  var maxX = zone.right - size;
  var minY = zone.top;
  var maxY = zone.bottom - size;
  var rects = [];
  function push(x0, y0, x1, y1) {
    var w = x1 - x0;
    var h = y1 - y0;
    if (w >= 0 && h >= 0) rects.push({ x: x0, y: y0, w: w, h: h });
  }

  // Левое, правое, верхнее и нижнее поля относительно объединённого бренда.
  push(minX, minY, brandLeft - gap - size, maxY);
  push(brandRight + gap, minY, maxX, maxY);
  push(minX, minY, maxX, brandTop - gap - size);
  push(minX, brandBottom + gap, maxX, maxY);
  return rects;
}

// Место ищем в той же зоне, где искры шли в рабочем режиме: это сам слой
// .brand-sparkles — полоса вокруг локапа. Внутри неё свободны только поля
// вокруг логотипа и надписи.
function brandSparklesMobilePoint(doc, win, layer, size) {
  if (!layer || typeof layer.getBoundingClientRect !== 'function') return null;
  var zone = layer.getBoundingClientRect();
  if (!zone.width || !zone.height) return null;

  var excluded = ['.brand-logo', '.brand-wordmark']
    .map(function (selector) {
      var node = doc.querySelector ? doc.querySelector(selector) : null;
      return node && typeof node.getBoundingClientRect === 'function'
        ? node.getBoundingClientRect()
        : null;
    })
    .filter(Boolean);
  var rects = brandSparklesMobileFreeRects(
    zone,
    excluded,
    size,
    BRAND_SPARKLES_MOBILE_GAP_PX
  );
  if (!rects.length) return null;

  var pick = rects[Math.floor(brandSparklesRand(win) * rects.length) % rects.length];
  var pageX = pick.x + brandSparklesRand(win) * pick.w;
  var pageY = pick.y + brandSparklesRand(win) * pick.h;
  return {
    x: Math.round(pageX - zone.left),
    y: Math.round(pageY - zone.top),
  };
}

function brandSparklesStartMobileTwinkles(doc, win, layer) {
  if (!doc || !win || !layer || !doc.createElement || !layer.appendChild) return null;
  if (layer.classList) layer.classList.add('is-mobile-twinkle');

  var star = doc.createElement('i');
  star.className = 'brand-sparkle brand-sparkle-mobile';
  star.setAttribute('aria-hidden', 'true');
  layer.appendChild(star);

  function schedule() {
    win.setTimeout(flash, brandSparklesMobileDelay(win));
  }

  function flash() {
    var sizeText =
      BRAND_SPARKLES_MOBILE_SIZES[
        Math.floor(brandSparklesRand(win) * BRAND_SPARKLES_MOBILE_SIZES.length) %
          BRAND_SPARKLES_MOBILE_SIZES.length
      ];
    var size = parseInt(sizeText, 10);
    var point = brandSparklesMobilePoint(doc, win, layer, size);
    if (!point) {
      schedule();
      return;
    }

    star.style.setProperty('--x', point.x + 'px');
    star.style.setProperty('--y', point.y + 'px');
    star.style.setProperty('--sz', sizeText);
    star.style.setProperty('--rot', brandSparklesTilt(win));
    if (star.classList) star.classList.remove('is-flashing');
    void star.offsetWidth;
    if (star.classList) star.classList.add('is-flashing');

    win.setTimeout(function () {
      if (star.classList) star.classList.remove('is-flashing');
    }, BRAND_SPARKLES_MOBILE_FLASH_MS);
    // Интервал считается между началами вспышек: ровно случайные 3–6 секунд.
    // Минимальная пауза длиннее 900ms, поэтому две вспышки не пересекаются.
    schedule();
  }

  schedule();
  return star;
}

// Десктопный спокойный режим: одна редкая вспышка, как на touch, но часть
// импульсов — парный AI-знак со спутником и расходящимся signal-ring.
function brandSparklesDesktopTwinkleFire(star, point, win) {
  if (!star || !point || !star.style) return;
  var paired = brandSparklesRand(win) >= 0.5;
  if (star.classList) {
    star.classList.remove('is-flashing', 'brand-sparkle-pair');
    if (paired) star.classList.add('brand-sparkle-pair');
  }
  star.style.setProperty('--x', point.x + 'px');
  star.style.setProperty('--y', point.y + 'px');
  star.style.setProperty('--sz', BRAND_SPARKLES_DESKTOP_TWINKLE_SIZE);
  star.style.setProperty('--rot', brandSparklesTilt(win));
  star.setAttribute('data-sparkle-kind', paired ? 'pair-ring' : 'single');
  void star.offsetWidth;
  if (star.classList) star.classList.add('is-flashing');
  return paired;
}

function brandSparklesStartDesktopTwinkles(doc, win, layer) {
  if (!doc || !win || !layer || !doc.createElement || !layer.appendChild) return null;
  if (layer.classList) layer.classList.add('is-desktop-twinkle');

  var star = doc.createElement('i');
  star.className = 'brand-sparkle brand-sparkle-desktop-twinkle';
  star.setAttribute('aria-hidden', 'true');
  layer.appendChild(star);

  var size = parseInt(BRAND_SPARKLES_DESKTOP_TWINKLE_SIZE, 10);

  function schedule() {
    win.setTimeout(flash, brandSparklesMobileDelay(win));
  }

  function flash() {
    var point = brandSparklesMobilePoint(doc, win, layer, size);
    if (!point) {
      schedule();
      return;
    }

    brandSparklesDesktopTwinkleFire(star, point, win);
    win.setTimeout(function () {
      if (star.classList) star.classList.remove('is-flashing');
    }, BRAND_SPARKLES_MOBILE_FLASH_MS);

    schedule();
  }

  schedule();
  return star;
}

// Подгоняет --spark-intro-*: верх слоя = верх header, низ — чуть ниже полосы.
// Ниже шапки clip сужает бока, чтобы зона не доходила до самых краёв.
// Без getBoundingClientRect оставляем CSS-fallback.
function brandSparklesFitIntroZone(layer, doc) {
  if (!layer || !layer.style || !doc) return;
  var lockup = layer.parentElement || layer.parentNode;
  var header = doc.querySelector ? doc.querySelector('header') : null;
  if (
    !lockup ||
    !header ||
    typeof lockup.getBoundingClientRect !== 'function' ||
    typeof header.getBoundingClientRect !== 'function'
  ) {
    return;
  }
  var lock = lockup.getBoundingClientRect();
  var head = header.getBoundingClientRect();
  if (!lock.width || !head.height) return;
  var zoneH = head.height + BRAND_SPARKLES_INTRO_BLEED_PX;
  var bandPct = Math.max(40, Math.min(95, (head.height / zoneH) * 100));
  layer.style.setProperty('--spark-intro-top', (head.top - lock.top).toFixed(2) + 'px');
  layer.style.setProperty(
    '--spark-intro-bottom',
    (lock.bottom - head.bottom - BRAND_SPARKLES_INTRO_BLEED_PX).toFixed(2) + 'px'
  );
  layer.style.setProperty('--spark-intro-band', bandPct.toFixed(2) + '%');
  layer.style.setProperty('--spark-intro-side', BRAND_SPARKLES_INTRO_SIDE_INSET + '%');
}

// Перезапуск в тёмной фазе: пауза до следующей вспышки задаётся --delay,
// поэтому переход с intro-фазы на рабочую не виден и не рвёт цепочку вспышек.
function brandSparklesHandOffStar(star, layer, win, waitMs) {
  if (!star || !star.style) return;
  star.style.setProperty('--delay', Math.round(waitMs) + 'ms');
  if (star.classList) star.classList.add('is-restarting');
  star.style.animation = 'none';
  void star.offsetWidth;
  if (star.classList) star.classList.remove('is-restarting');
  star.style.animation = '';
  brandSparklesRedistributeHidden(layer, win, star);
}

function brandSparklesAppendTriadSteps(doc, extra) {
  if (!doc || !extra || typeof extra.appendChild !== 'function') return;
  var step2 = doc.createElement('b');
  step2.className = 'brand-sparkle-step brand-sparkle-step-2';
  var step3 = doc.createElement('b');
  step3.className = 'brand-sparkle-step brand-sparkle-step-3';
  extra.appendChild(step2);
  extra.appendChild(step3);
}

function brandSparklesTakeCell(cells, preferRight) {
  for (var i = 0; i < cells.length; i++) {
    var col = cells[i] % 4;
    if (preferRight ? col >= 2 : col <= 1) {
      return cells.splice(i, 1)[0];
    }
  }
  return cells.length ? cells.shift() : -1;
}

function brandSparklesCreateExtras(doc, layer, win, count, cellCount) {
  var extras = [];
  if (!doc || !doc.createElement || !layer || !layer.appendChild) return extras;
  var rows = Math.ceil(cellCount / 4) || 1;
  var cells = brandSparklesShuffle(
    (function () {
      var all = [];
      for (var i = 0; i < cellCount; i++) all.push(i);
      return all;
    })(),
    win
  );
  // Из четырёх доп.: триада вправо (правая половина), триада влево (левая),
  // и две одиночные. Так цепочки не упираются в край локапа.
  var hrCell = brandSparklesTakeCell(cells, true);
  var hlCell = brandSparklesTakeCell(cells, false);

  for (var j = 0; j < count; j++) {
    var extra = doc.createElement('i');
    var cell = -1;
    if (j === 0 && hrCell >= 0) {
      extra.className =
        'brand-sparkle brand-sparkle-extra brand-sparkle-triad brand-sparkle-triad-hr';
      extra.style.setProperty('--sz', '11px');
      brandSparklesAppendTriadSteps(doc, extra);
      cell = hrCell;
    } else if (j === 1 && hlCell >= 0) {
      extra.className =
        'brand-sparkle brand-sparkle-extra brand-sparkle-triad brand-sparkle-triad-hl';
      extra.style.setProperty('--sz', '11px');
      brandSparklesAppendTriadSteps(doc, extra);
      cell = hlCell;
    } else {
      extra.className = 'brand-sparkle brand-sparkle-extra';
      extra.style.setProperty(
        '--sz',
        BRAND_SPARKLES_EXTRA_SIZES[
          Math.floor(brandSparklesRand(win) * BRAND_SPARKLES_EXTRA_SIZES.length) %
            BRAND_SPARKLES_EXTRA_SIZES.length
        ]
      );
      cell = cells.length ? cells.shift() : 0;
    }
    brandSparklesPositionInCell(extra, cell, rows, win);
    extra.setAttribute('aria-hidden', 'true');
    extra.style.setProperty('--dur', BRAND_SPARKLES_CYCLE_MS + 'ms');
    layer.appendChild(extra);
    extras.push(extra);
  }
  return extras;
}

function brandSparklesRemoveStar(layer, star) {
  if (!star) return;
  var parent = star.parentNode || layer;
  if (parent && parent.removeChild) parent.removeChild(star);
}

function brandSparklesRunIntro(win, layer, doc, ctx) {
  var stars = Array.prototype.slice.call(layer.querySelectorAll('.brand-sparkle'));
  if (!stars.length) return;

  ctx = ctx || {};
  var workingMode = brandSparklesResolveMode(ctx.workingMode, BRAND_SPARKLES_WORKING_MODES);
  var continueWorking = Boolean(workingMode);

  var n = stars.length;
  var introFlow = brandSparklesCreateIntroFlow(win);
  // Порядок появления считаем в пропорциях расширенной зоны: она выше рабочей.
  var introAspect = brandSparklesZoneAspect(layer, doc, true);
  var appearOrder = brandSparklesIntroOrder(stars, introFlow, introAspect);
  // Рабочий режим стартует на том же маршруте, что intro: курс меняется потом,
  // по одной погасшей искре. Ранги пересчитаны под рабочую зону.
  if (continueWorking) {
    brandSparklesWorkingState(
      layer,
      win,
      stars,
      introFlow,
      brandSparklesZoneAspect(layer, doc, false)
    );
  }
  var step = BRAND_SPARKLES_CYCLE_MS / n;

  layer.classList.add('is-intro');
  // Сначала расширяем зону: те же --x/--y % заполняют более высокий прямоугольник.
  brandSparklesFitIntroZone(layer, doc);
  layer.classList.add('is-intro-zone');
  // Extras нужны только на стыке с рабочим циклом — без него плотность не проседает.
  var extras = continueWorking
    ? brandSparklesCreateExtras(doc, layer, win, BRAND_SPARKLES_EXTRA_COUNT, n)
    : [];

  // Та же сборка seed → знак → спутник, что и дальше: первые появления не
  // обрываются другой анимацией. Направление задаёт единый случайный flow:
  // точки не рассыпаются хаотично, хотя источник меняется при каждом intro.
  var appearDelays = stars.map(function (star, index) {
    var delayMs = Math.round(
      (appearOrder[index] / Math.max(1, n - 1)) * BRAND_SPARKLES_APPEAR_SPREAD_MS
    );
    star.style.setProperty('--delay', delayMs + 'ms');
    return delayMs;
  });

  var extraOrder = extras.length
    ? brandSparklesIntroOrder(extras, introFlow, introAspect)
    : [];
  var extraDelays = extras.map(function (extra, index) {
    // Тот же разбег, что у основных: extras подчёркивают фронт, а не превращают
    // старт в россыпь. Небольшой сдвиг, чтобы не совпасть с соседней основной.
    var delayMs = Math.round(
      (extraOrder[index] / Math.max(1, extras.length - 1)) * BRAND_SPARKLES_APPEAR_SPREAD_MS + 140
    );
    if (delayMs > BRAND_SPARKLES_APPEAR_SPREAD_MS + 140) {
      delayMs = BRAND_SPARKLES_APPEAR_SPREAD_MS + 140;
    }
    extra.style.setProperty('--delay', delayMs + 'ms');
    return delayMs;
  });

  win.requestAnimationFrame(function () {
    layer.classList.remove('is-intro');
    brandSparklesRestartLoop(layer);

    if (continueWorking) {
      // Каждая искра переходит на рабочую фазу в своей тёмной паузе, не дожидаясь
      // конца всей серии: цепочка вспышек не прерывается, паузы между режимами нет.
      stars.forEach(function (star, index) {
        var handoffAt = appearDelays[index] + BRAND_SPARKLES_DARK_AT_MS;
        // Рабочий слот берётся по тому же порядку потока, что и появление: шаг
        // раскладки (312 мс при 16 искрах) шире шага intro, поэтому ждать лишний
        // цикл не нужно, а направление продолжается.
        var nextFlashAt = BRAND_SPARKLES_DARK_AT_MS + appearOrder[index] * step;
        while (nextFlashAt < handoffAt) nextFlashAt += BRAND_SPARKLES_CYCLE_MS;

        win.setTimeout(function () {
          brandSparklesHandOffStar(star, layer, win, nextFlashAt - handoffAt);
        }, handoffAt);
      });

      // Временные искры дают ещё по одной вспышке в момент, когда пачка intro уже
      // отработала, а рабочий фронт только разворачивается: провала не видно.
      extras.forEach(function (extra, index) {
        var handoffAt = extraDelays[index] + BRAND_SPARKLES_DARK_AT_MS;
        var fillAt = BRAND_SPARKLES_EXTRA_FILL_AT_MS + index * BRAND_SPARKLES_EXTRA_FILL_STEP_MS;
        if (fillAt < handoffAt) fillAt = handoffAt;

        win.setTimeout(function () {
          brandSparklesHandOffStar(extra, layer, win, fillAt - handoffAt);
        }, handoffAt);
        win.setTimeout(function () {
          brandSparklesRemoveStar(layer, extra);
        }, fillAt + BRAND_SPARKLES_DARK_AT_MS);
      });
    } else {
      // Intro без рабочего цикла: после первой вспышки гасим и замираем.
      stars.forEach(function (star, index) {
        var freezeAt = appearDelays[index] + BRAND_SPARKLES_DARK_AT_MS;
        win.setTimeout(function () {
          if (star.classList) star.classList.add('is-restarting');
          star.style.animation = 'none';
          star.style.opacity = '0';
        }, freezeAt);
      });
    }

    // Серия intro доиграна: последняя первая вспышка погасла. Зону возвращаем к
    // рабочему inset, пересчитав позиции так, что видимые точки не двигаются.
    var introEndsAt =
      appearDelays.reduce(function (max, delay) {
        return delay > max ? delay : max;
      }, 0) + BRAND_SPARKLES_DARK_AT_MS;
    win.setTimeout(function () {
      brandSparklesCollapseZone(layer, doc, win);
    }, introEndsAt);
  });
}

function initBrandSparkles(doc, win) {
  if (!doc || !win) return;
  var layer = doc.querySelector('.brand-sparkles');
  if (!layer) return;
  // Флаг из ambient-particle-flags.js: false — слой убираем, как ambient-частицу.
  if (!brandSparklesEnabled(doc, win)) {
    brandSparklesRemoveLayer(layer);
    return;
  }
  if (brandSparklesReduced(win)) return;

  if (brandSparklesMobile(win)) {
    brandSparklesStartMobileTwinkles(doc, win, layer);
    return;
  }

  brandSparklesLayout(layer, win);

  var modes = brandSparklesModes(doc, win);
  // Перекладка скрытых точек — часть рабочего цикла, не intro.
  if (modes.working) {
    brandSparklesBindMotion(layer, win);
  }

  if (modes.intro) {
    brandSparklesWhenBrandVisible(doc, win, function () {
      BRAND_SPARKLES_INTRO_MODES[modes.intro](win, layer, doc, {
        workingMode: modes.working,
      });
    });
    return;
  }

  if (modes.working) {
    BRAND_SPARKLES_WORKING_MODES[modes.working](win, layer, doc);
    return;
  }

  brandSparklesFreezeLayer(layer);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initBrandSparkles(document, window);
    });
  } else {
    initBrandSparkles(document, window);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initBrandSparkles: initBrandSparkles,
    brandSparklesReduced: brandSparklesReduced,
    brandSparklesMobile: brandSparklesMobile,
    brandSparklesMobileDelay: brandSparklesMobileDelay,
    brandSparklesIntersectsRect: brandSparklesIntersectsRect,
    brandSparklesMobilePoint: brandSparklesMobilePoint,
    brandSparklesMobileFreeRects: brandSparklesMobileFreeRects,
    brandSparklesStartMobileTwinkles: brandSparklesStartMobileTwinkles,
    brandSparklesStartDesktopTwinkles: brandSparklesStartDesktopTwinkles,
    brandSparklesEnabled: brandSparklesEnabled,
    brandSparklesPageKey: brandSparklesPageKey,
    brandSparklesModes: brandSparklesModes,
    brandSparklesResolveMode: brandSparklesResolveMode,
    brandSparklesRegisterIntroMode: brandSparklesRegisterIntroMode,
    brandSparklesRegisterWorkingMode: brandSparklesRegisterWorkingMode,
    brandSparklesFreezeLayer: brandSparklesFreezeLayer,
    brandSparklesIsSwapArrival: brandSparklesIsSwapArrival,
    brandSparklesLayout: brandSparklesLayout,
    brandSparklesTilt: brandSparklesTilt,
    brandSparklesCreateIntroFlow: brandSparklesCreateIntroFlow,
    brandSparklesIntroOrder: brandSparklesIntroOrder,
    brandSparklesZoneAspect: brandSparklesZoneAspect,
    brandSparklesZoneBox: brandSparklesZoneBox,
    brandSparklesCollapseZone: brandSparklesCollapseZone,
    brandSparklesHandOffStar: brandSparklesHandOffStar,
    brandSparklesWorkingState: brandSparklesWorkingState,
    brandSparklesStartWorkingLoop: brandSparklesStartWorkingLoop,
    brandSparklesFitIntroZone: brandSparklesFitIntroZone,
    brandSparklesPositionInCell: brandSparklesPositionInCell,
    brandSparklesRedistributeHidden: brandSparklesRedistributeHidden,
    brandSparklesBindMotion: brandSparklesBindMotion,
    brandSparklesRestartLoop: brandSparklesRestartLoop,
    brandSparklesCreateWorkingFlow: brandSparklesCreateWorkingFlow,
    brandSparklesCreateExtras: brandSparklesCreateExtras,
    brandSparklesRunIntro: brandSparklesRunIntro,
    brandSparklesWhenBrandVisible: brandSparklesWhenBrandVisible,
    brandSparklesShuffle: brandSparklesShuffle,
    brandSparklesRand: brandSparklesRand,
    BRAND_SPARKLES_INTRO_MODES: BRAND_SPARKLES_INTRO_MODES,
    BRAND_SPARKLES_WORKING_MODES: BRAND_SPARKLES_WORKING_MODES,
  };
  globalThis.initBrandSparkles = initBrandSparkles;
}
