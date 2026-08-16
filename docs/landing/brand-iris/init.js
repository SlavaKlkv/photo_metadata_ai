'use strict';

// Сборка ириса: состояние метки и события шапки.
//
// Состояний ровно три, и все они выводятся из двух фактов — указатель (или
// фокус) на бренде и спущен ли затвор:
//
//   не на бренде      → покой   (0), фиксация снимается
//   на бренде, спущен → закрыт  (+1)
//   на бренде         → раскрыт (−1)
//
// Поэтому положение метки задаётся в одном месте — applyPose(). Обработчики
// только меняют факты; раньше каждый из них дёргал метку сам, и любой новый
// краевой случай ломал соседние.
//
// На таче этой модели нет: sticky :hover и отсутствие mouseleave оставляли
// затвор закрытым после тапа. Там — отдельный импульс: показать раскрытие →
// закрыть → держать до конца скролла/peer-перехода → покой.
// Тап определяем шире, чем один (hover: none): iOS «сайт для компьютера» и
// DevTools часто оставляют hover: hover, а палец всё равно touch.

function initBrandIris(doc, win) {
  var brands = doc.querySelectorAll('.brand');
  if (!brands.length || !win.requestAnimationFrame) return;

  var reduced = win.matchMedia
    ? win.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  // Устройство без настоящего hover (или грубый указатель).
  function isTapDevice() {
    try {
      if (!win.matchMedia) return false;
      if (win.matchMedia('(hover: none)').matches) return true;
      if (win.matchMedia('(pointer: coarse)').matches) return true;
    } catch (err) {
      /* matchMedia недоступен */
    }
    return false;
  }

  // Этот жест — тап/перо, даже если media врёт (desktop-site на iPhone).
  function isTapPress(event) {
    if (isTapDevice()) return true;
    if (!event || typeof event.pointerType !== 'string') return false;
    return event.pointerType !== '' && event.pointerType !== 'mouse';
  }

  // header-swap.js помечает документ, когда уводит на соседнюю страницу.
  function isLeaving() {
    return Boolean(
      doc.documentElement &&
        doc.documentElement.classList &&
        doc.documentElement.classList.contains('header-swap-out')
    );
  }

  function isSwapArrival() {
    return Boolean(
      doc.documentElement &&
        doc.documentElement.classList &&
        doc.documentElement.classList.contains('header-swap')
    );
  }

  Array.prototype.forEach.call(brands, function (brand) {
    var pathEl = brand.querySelector('.brand-blades');
    if (!pathEl) return;

    // Ссылка всегда hand — даже до того, как движок «проснулся» после nav.
    if (brand.style && !brand.style.cursor) brand.style.cursor = 'pointer';

    var iris = createBrandIris(pathEl, win);
    var presence = createBrandPresence(doc, win, brand);

    // Факты, из которых выводится всё остальное.
    var pointerOn = false; // указатель на бренде
    var focused = false; // бренд под клавиатурным фокусом
    // Затвор, спущенный нажатием, залипает: отпускание кнопки его не
    // раскрывает — метка остаётся закрытой, пока курсор не уйдёт с бренда.
    // Поэтому mouseup не слушаем вовсе.
    var latched = false;
    var leaving = false; // уходим на соседнюю страницу, состояние заморожено
    var handoffTarget = 0;
    var pose = null; // текущая цель хода; null — ещё не задавали
    // Пришёл ли за окно прибытия достоверный сигнал о курсоре (родной hover
    // или движение мыши). Если да, сверять в конце окна нечего — иначе метка
    // переспрашивала бы у пустого :hover и сама себя опровергала.
    var confirmed = false;

    // Мобильный импульс тапа: пока идёт, applyPose не вмешивается.
    var tapping = false;
    var tapTimers = [];

    // На таче CSS-transition не играет: iOS ставит :hover/:focus-visible
    // без перехода, надпись щёлкает. Слой .brand-name-lit ведём сами —
    // тем же rAF и easing, что раскрытие затвора.
    if (isTapDevice() && brand.classList) brand.classList.add('is-tap');

    var litEl = brand.querySelector('.brand-name-lit');
    var litFrame = 0;
    var litValue = 0;

    function paintLit(value) {
      litValue = value;
      if (litEl && litEl.style) litEl.style.opacity = String(value);
    }

    function stopLitFrame() {
      if (litFrame && win.cancelAnimationFrame) win.cancelAnimationFrame(litFrame);
      litFrame = 0;
    }

    function animateLit(target) {
      if (!litEl || !litEl.style) return;
      if (reduced.matches) {
        stopLitFrame();
        paintLit(0);
        return;
      }
      stopLitFrame();
      var from = litValue;
      var to = target ? 1 : 0;
      if (from === to) {
        paintLit(to);
        return;
      }
      var duration = target ? BRAND_IRIS.OPEN_MS : BRAND_IRIS.REST_MS;
      var startedAt = win.performance && win.performance.now ? win.performance.now() : Date.now();
      function step(now) {
        var p = duration > 0 ? Math.min(1, (now - startedAt) / duration) : 1;
        paintLit(from + (to - from) * brandIrisEaseOpen(p));
        if (p < 1) {
          litFrame = win.requestAnimationFrame(step);
          return;
        }
        litFrame = 0;
      }
      litFrame = win.requestAnimationFrame(step);
    }

    function setLit(on, instant) {
      if (brand.classList) {
        if (on) brand.classList.add('is-lit');
        else brand.classList.remove('is-lit');
      }
      if (instant || reduced.matches) {
        stopLitFrame();
        paintLit(on && !reduced.matches ? 1 : 0);
        return;
      }
      animateLit(on);
    }

    function clearTapTimers() {
      if (!win.clearTimeout) {
        tapTimers = [];
        return;
      }
      tapTimers.forEach(function (id) {
        win.clearTimeout(id);
      });
      tapTimers = [];
    }

    function tapLater(ms, fn) {
      if (!win.setTimeout) {
        fn();
        return 0;
      }
      var id = win.setTimeout(fn, ms);
      tapTimers.push(id);
      return id;
    }

    function scrollY() {
      if (typeof win.scrollY === 'number') return win.scrollY;
      if (typeof win.pageYOffset === 'number') return win.pageYOffset;
      var root = doc.documentElement;
      if (root && typeof root.scrollTop === 'number') return root.scrollTop;
      return 0;
    }

    // :hover после навигации пуст, пока мышь не сдвинется, и ссылка перестаёт
    // выглядеть кликабельной. Пока курсор на бренде, курсор-руку ставим сами.
    function syncCursor(active) {
      if (!doc.documentElement || !doc.documentElement.style) return;
      var synthetic = active && !(brand.matches && brand.matches(':hover'));
      doc.documentElement.style.cursor = synthetic ? 'pointer' : '';
    }

    function applyPose() {
      if (leaving || tapping) return;
      // На тач-устройстве hover-поз нет: иначе sticky :hover снова раскрывал бы
      // метку сразу после импульса тапа.
      var active = isTapDevice() ? focused : pointerOn || focused;
      if (!active) latched = false;
      syncCursor(active);
      if (reduced.matches) {
        // Ход выключен: метку не трогаем вовсе, только возвращаем в покой,
        // если что-то успело её сдвинуть.
        if (!active) {
          iris.reset();
          pose = 0;
        }
        return;
      }
      var next = active ? (latched ? 1 : -1) : 0;
      if (pose === next) return;
      pose = next;
      iris.animate(next);
    }

    function setPointerOn(value) {
      if (isTapDevice()) return;
      if (pointerOn === value) return;
      pointerOn = value;
      // Курсор доказал, что ушёл: гадать по зоне прибытия больше не нужно.
      if (!value) presence.closeArrival();
      applyPose();
    }

    // Ждём конец подъёма (два тика подряд у scrollY ≈ 0) или таймаут —
    // peer-leave сам заберёт управление через freezeForLeave.
    function waitScrollSettled(done) {
      var started = win.performance && win.performance.now ? win.performance.now() : Date.now();
      var stable = 0;

      function tick() {
        if (leaving) return;
        var now = win.performance && win.performance.now ? win.performance.now() : Date.now();
        var y = scrollY();
        stable = y <= 0 ? stable + 1 : 0;
        if (stable >= 2 || now - started >= BRAND_IRIS.TAP_SETTLE_MAX_MS) {
          done();
          return;
        }
        tapLater(50, tick);
      }

      tapLater(50, tick);
    }

    function finishTapPulse() {
      if (leaving || reduced.matches) {
        tapping = false;
        setLit(false);
        return;
      }
      tapping = false;
      latched = false;
      pointerOn = false;
      focused = false;
      pose = 0;
      setLit(false);
      iris.animate(0);
    }

    // Тап: то же плавное раскрытие, что на десктопе (OPEN_MS), затем спуск
    // и держим закрытым до конца скролла/ухода → покой.
    // Надпись загорается вместе с раскрытием и гаснет только в покое —
    // не от sticky :hover, который на таче вспыхивает и сразу тухнет.
    function startTapPulse() {
      if (reduced.matches || leaving) return;
      clearTapTimers();
      tapping = true;
      pointerOn = false;
      focused = false;
      latched = false;
      pose = -1;
      if (brand.classList) brand.classList.add('is-tap');
      setLit(true);
      iris.animate(-1);

      tapLater(BRAND_IRIS.OPEN_MS, function () {
        if (leaving) return;
        tapLater(BRAND_IRIS.TAP_HOLD_MS, function () {
          if (leaving) return;
          pose = 1;
          iris.animate(1);
          tapLater(BRAND_IRIS.SHUT_MS, function () {
            if (leaving) return;
            waitScrollSettled(finishTapPulse);
          });
        });
      });
    }

    // --- уход на соседнюю страницу -----------------------------------------

    function captureHandoff() {
      if (reduced.matches || !brand.getBoundingClientRect) return;
      var point = presence.point();
      brandIrisSaveHandoff(win, brand.getBoundingClientRect(), iris.value(), handoffTarget, {
        px: point.x,
        py: point.y,
        over: handoffTarget !== 0 || pointerOn || focused,
      });
    }

    // Фиксируем цель до того, как выгрузка страницы пришлёт mouseleave и
    // собьёт latched: щелчок должен доиграть уже на новой странице.
    function freezeForLeave() {
      if (leaving || reduced.matches) return;
      if (tapping) {
        // Мобильный тап: на соседней странице доигрываем закрытый затвор.
        clearTapTimers();
        handoffTarget = 1;
        pose = 1;
        iris.animate(1);
      } else {
        handoffTarget = pointerOn || focused ? (latched ? 1 : -1) : 0;
      }
      leaving = true;
      tapping = false;
      captureHandoff();
    }

    // --- события ------------------------------------------------------------

    brand.addEventListener('mouseenter', function (event) {
      presence.track(event);
      if (isTapDevice() || tapping) return;
      // Родной hover — достоверный сигнал: гадать по зоне больше не нужно.
      confirmed = true;
      presence.closeArrival();
      setPointerOn(true);
    });

    function onPress(event) {
      presence.track(event);
      if (reduced.matches || leaving) return;
      // touch/pen: button бывает 0 или −1; отсекаем только не-primary мышь.
      if (event && typeof event.button === 'number' && event.button > 0) return;
      if (isTapPress(event)) {
        startTapPulse();
        return;
      }
      pointerOn = true;
      latched = true;
      applyPose();
    }

    // pointerdown раньше синтетического mousedown после touch — импульс
    // стартует под пальцем, а не после отпускания.
    if (typeof win.PointerEvent !== 'undefined') {
      brand.addEventListener('pointerdown', onPress);
    } else {
      brand.addEventListener('mousedown', onPress);
    }

    brand.addEventListener('mouseleave', function (event) {
      presence.track(event);
      if (isLeaving()) freezeForLeave();
      if (leaving || isTapDevice() || tapping) return;
      // В окне прибытия mouseleave часто фантомный: документ сменился, а курсор
      // с логотипа не уходил. Судит зона. Вне окна событию верим как есть —
      // браузер знает про указатель больше, чем последняя известная точка.
      if (presence.arriving() && presence.isOver() === true) return;
      confirmed = true;
      presence.closeArrival();
      setPointerOn(false);
    });

    // Клавиатура ведёт себя так же: фокус раскрывает затвор, Enter или пробел
    // спускают его, уход фокуса возвращает метку в покой.
    // Только клавиатурный фокус: клик мышью тоже фокусирует ссылку, но там
    // всё решает указатель — иначе после клика метка залипала бы раскрытой,
    // хотя курсор уже ушёл.
    brand.addEventListener('focus', function () {
      focused = brand.matches ? brand.matches(':focus-visible') : true;
      applyPose();
    });

    // Клик по логотипу ведёт на #top, и переход к якорю снимает с ссылки фокус
    // (в WebKit — сразу после нажатия). Затвор при этом трогать нельзя: курсор
    // всё ещё на бренде.
    brand.addEventListener('blur', function () {
      focused = false;
      applyPose();
    });

    brand.addEventListener('keydown', function (event) {
      if (!event) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      if (reduced.matches || leaving) return;
      if (isTapDevice()) {
        startTapPulse();
        return;
      }
      latched = true;
      applyPose();
    });

    // Движение указателя — единственный источник правды, когда родные
    // mouseenter/mouseleave врут (сразу после навигации) или не приходят вовсе.
    function onPointerMove(event) {
      presence.track(event);
      if (leaving || reduced.matches || isTapDevice() || tapping) return;
      var over = presence.isOver(
        event && typeof event.clientX === 'number' ? event.clientX : undefined,
        event && typeof event.clientY === 'number' ? event.clientY : undefined
      );
      if (over === null) return;
      confirmed = true;
      setPointerOn(over);
    }

    win.addEventListener('pointermove', onPointerMove, { passive: true });
    win.addEventListener('mousemove', onPointerMove, { passive: true });

    if (reduced.addEventListener) {
      reduced.addEventListener('change', function () {
        if (reduced.matches) {
          clearTapTimers();
          tapping = false;
          pose = 0;
          setLit(false);
          iris.reset();
        }
      });
    }

    if (reduced.matches) return;

    // header-swap ставит .header-swap-out при клике — фиксируем handoff сразу,
    // пока layout и latched ещё живы (не ждём pagehide после LEAVE_MS).
    // Если класс снят (target=_blank: остались на странице) — оставляем handoff
    // для новой вкладки и размораживаем iris.
    if (win.MutationObserver && doc.documentElement) {
      var leaveWatch = new win.MutationObserver(function () {
        if (isLeaving()) {
          freezeForLeave();
        } else if (leaving) {
          leaving = false;
          setLit(false);
          applyPose();
        }
      });
      leaveWatch.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    // Только при peer leave (header-swap-out). Иначе F5/pagehide писал handoff,
    // а новая загрузка «доигрывала» чужой затвор — нестабильно.
    win.addEventListener('pagehide', function () {
      if (!leaving && !isLeaving()) return;
      freezeForLeave();
      captureHandoff();
    });

    // --- прибытие с соседней страницы --------------------------------------

    var saved = brandIrisTakeHandoff(win);
    // handoff без маркера header-swap — чужой остаток (F5, другая вкладка).
    if (!saved || !isSwapArrival() || !brand.getBoundingClientRect) return;

    if (typeof saved.px === 'number' || typeof saved.py === 'number') {
      presence.track({ clientX: saved.px, clientY: saved.py });
    }

    var here = brand.getBoundingClientRect();
    if (typeof saved.x === 'number' && typeof saved.y === 'number') {
      presence.openArrival(
        {
          left: saved.x,
          top: saved.y,
          right: saved.x + (here.width || 0),
          bottom: saved.y + (here.height || 0),
        },
        here
      );
      brandIrisTravel(brand, saved.x - here.left, saved.y - here.top, win);
    }

    var target = typeof saved.to === 'number' ? saved.to : 0;
    if (!target && !saved.over) {
      presence.closeArrival();
      return;
    }

    // Метка появляется сразу в конечном положении, а не там, где её застал
    // переход: щелчок случился на покинутой странице, его ход виден там же.
    // Иначе новая страница на кадр показывала покой и только потом
    // захлопывалась — вспышка на самом видном месте шапки.
    iris.set(target);
    pose = target;
    latched = target > 0;
    // Где курсор, пока неизвестно: hover пуст, координат может не быть вовсе.
    // Тогда верим покинутой странице — ненулевая цель хода означает, что
    // указатель был на бренде, и щелчок обязан доиграть здесь.
    // После тапа курсора нет — не держим «над брендом».
    if (isTapDevice()) {
      pointerOn = false;
      // Закрытый handoff с мобильного тапа: додержать затвор и сесть в покой
      // после окна прибытия (скролла на новой странице уже нет).
      if (target > 0) {
        tapping = true;
        setLit(true, true);
        tapLater(brandIrisArriveMs(), function () {
          if (leaving) return;
          presence.closeArrival();
          finishTapPulse();
        });
        return;
      }
      presence.closeArrival();
      return;
    }

    var arrivedOver = presence.isOver();
    if (arrivedOver === null) arrivedOver = Boolean(saved.over) || target !== 0;
    pointerOn = arrivedOver === true;
    applyPose();

    if (!win.setTimeout) {
      presence.closeArrival();
      return;
    }

    // Конец окна прибытия. Если за это время браузер уже сказал что-то
    // достоверное про курсор, верим ему. Если промолчал — решаем сами, и
    // именно сейчас: бренд доехал, hit-test снова осмыслен. Проверка идёт до
    // закрытия окна, иначе запоздавший переезд читается как уход — затвор
    // снимался с фиксации, и первое движение мыши его раскрывало.
    win.setTimeout(function () {
      if (!confirmed) {
        var over = presence.isOver();
        if (over === null) over = presence.overNow();
        pointerOn = Boolean(over);
      }
      presence.closeArrival();
      applyPose();
    }, brandIrisArriveMs());
  });
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initBrandIris(document, window);
    });
  } else {
    initBrandIris(document, window);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initBrandIris: initBrandIris };
  globalThis.initBrandIris = initBrandIris;
}
