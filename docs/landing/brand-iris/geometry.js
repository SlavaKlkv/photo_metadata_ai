'use strict';

// Геометрия диафрагмы логотипа: размеры, кинематика лепестков и путь метки.
// Модуль ничего не знает про DOM и события — только числа и строка d.
//
// Метка строится по схеме настоящего ириса: корпус, кольцо отверстия и шесть
// кромок-лепестков, каждая из которых остаётся касательной к отверстию.
// Лепестки сидят на кривошипе, поэтому при повороте одновременно
// проворачиваются и меняют отверстие — у краёв хода механизм сам собой
// замедляется, как в объективе.
//
// Ход задаётся одним числом: −1 — раскрыто (наведение), 0 — покой, +1 — затвор
// закрыт (нажатие). При 0 путь повторяет метку из icon.svg, поэтому без скрипта
// (или при prefers-reduced-motion) логотип остаётся ровно таким, как в разметке.

// Все размеры — в координатах группы метки внутри viewBox (0…31.875).
var BRAND_IRIS = {
  CENTER: 15.9375, // центр метки
  R_BODY: 15.9375, // внешний радиус корпуса
  R_BORE: 13.28125, // внутренний край корпуса: под ним прячутся торцы лепестков
  R_REST: 5.765625, // отверстие в покое — та самая «стадия» из icon.svg
  R_SHUT: 2.6, // закрытый затвор: отверстие остаётся видимым кружком
  EDGE: 2.125, // толщина кромки лепестка, она же ширина кольца отверстия
  BLADES: 6,
  TAU_REST: 60, // угол первой точки касания в покое
  SWING: 34, // ход лепестков в каждую сторону от покоя, градусы
  CRANK: 72.7, // фаза кривошипа: из неё же получается раскрытие ≈ 9.6
  SHUT_MS: 190, // спуск: затвор захлопывается почти мгновенно
  OPEN_MS: 340, // раскрытие при наведении и на тапе — одна и та же плавная длительность
  REST_MS: 380, // возврат в покой, когда курсор ушёл
  // Сколько после полного раскрытия держать открытым на тапе, прежде чем спуск.
  TAP_HOLD_MS: 0,
  TAP_SETTLE_MAX_MS: 2500,
  LIMIT: 1.12, // предел отдачи пружины за крайние положения
  TRAVEL_MS: 420, // переезд бренда на новое место при переходе между страницами
  // leave (220ms) + network + parse; на медленных машинах 1.5s не хватало.
  HANDOFF_TTL: 5000,
  SETTLE_MS: 450, // сколько ждём курсор на новой странице, прежде чем встать в покой
  ZONE_PAD: 2, // допуск зоны прибытия: клик у самого края метки — всё ещё «на ней»
  HANDOFF_KEY: 'brand-iris-handoff',
};

// Окно прибытия: сколько новая страница считается «ещё разбирающейся, где
// указатель». Пока оно открыто, hover синтетический — браузер пересобирает
// его сам и может прислать mouseleave, хотя курсор с логотипа не уходил.
function brandIrisArriveMs() {
  return Math.max(BRAND_IRIS.SETTLE_MS, BRAND_IRIS.TRAVEL_MS + 40);
}

function brandIrisRad(deg) {
  return (deg * Math.PI) / 180;
}

function brandIrisRound(value) {
  return Math.round(value * 1000) / 1000;
}

// Радиус отверстия при повороте лепестков на t * SWING градусов.
// r(t) = base − amp * cos(CRANK − t * SWING): кривошип, плечо и фаза которого
// подогнаны под R_REST (t = 0) и R_SHUT (t = 1). Раскрытие (t = −1) считается
// той же формулой, отдельной подгонки не требует.
function brandIrisBore(t) {
  var k = BRAND_IRIS;
  var rest = Math.cos(brandIrisRad(k.CRANK));
  var shut = Math.cos(brandIrisRad(k.CRANK - k.SWING));
  var amp = (k.R_REST - k.R_SHUT) / (shut - rest);
  var base = k.R_REST + amp * rest;
  return base - amp * Math.cos(brandIrisRad(k.CRANK - t * k.SWING));
}

// Окружность двумя дугами. sweep = 1 — контур, sweep = 0 — вырез в нём:
// у path действует nonzero, поэтому встречные направления дают отверстие,
// а наложенные друг на друга лепестки и кольца — сплошную заливку.
function brandIrisCircle(radius, sweep) {
  var c = BRAND_IRIS.CENTER;
  var r = brandIrisRound(radius);
  var right = brandIrisRound(c + radius);
  var left = brandIrisRound(c - radius);
  var mid = brandIrisRound(c);
  return (
    'M' + right + ' ' + mid +
    'A' + r + ' ' + r + ' 0 1 ' + sweep + ' ' + left + ' ' + mid +
    'A' + r + ' ' + r + ' 0 1 ' + sweep + ' ' + right + ' ' + mid +
    'Z'
  );
}

// t = −1 — раскрыто, 0 — покой (метка из icon.svg), +1 — затвор закрыт.
function brandIrisPath(t) {
  var k = BRAND_IRIS;
  var c = k.CENTER;
  var bore = brandIrisBore(t);
  var rim = bore + k.EDGE; // внешний край кольца отверстия
  // Длина кромки подобрана так, чтобы её торец всегда оставался за R_BORE,
  // то есть под корпусом: иначе на срезе появлялась бы ступенька.
  var reach = Math.sqrt(k.R_BODY * k.R_BODY - rim * rim);

  var d =
    brandIrisCircle(k.R_BODY, 1) +
    brandIrisCircle(k.R_BORE, 0) +
    brandIrisCircle(rim, 1) +
    brandIrisCircle(bore, 0);

  for (var i = 0; i < k.BLADES; i++) {
    var tau = brandIrisRad(k.TAU_REST + (i * 360) / k.BLADES - t * k.SWING);
    var nx = Math.cos(tau);
    var ny = Math.sin(tau); // нормаль: направление на точку касания
    var ux = -ny;
    var uy = nx; // касательная: вдоль неё уходит кромка лепестка
    var tx = c + bore * nx;
    var ty = c + bore * ny;
    var rx = c + rim * nx;
    var ry = c + rim * ny;
    d +=
      'M' + brandIrisRound(tx) + ' ' + brandIrisRound(ty) +
      'L' + brandIrisRound(rx) + ' ' + brandIrisRound(ry) +
      'L' + brandIrisRound(rx + reach * ux) + ' ' + brandIrisRound(ry + reach * uy) +
      'L' + brandIrisRound(tx + reach * ux) + ' ' + brandIrisRound(ty + reach * uy) +
      'Z';
  }

  return d;
}

// Модули лендинга подключаются обычными <script> и общаются через глобальную
// область: сборки здесь нет и не планируется. В Node (тесты) ту же роль играет
// globalThis, поэтому экспорт заодно раскладывает имена туда.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BRAND_IRIS: BRAND_IRIS,
    brandIrisArriveMs: brandIrisArriveMs,
    brandIrisRad: brandIrisRad,
    brandIrisRound: brandIrisRound,
    brandIrisBore: brandIrisBore,
    brandIrisCircle: brandIrisCircle,
    brandIrisPath: brandIrisPath,
  };
  Object.keys(module.exports).forEach(function (name) {
    globalThis[name] = module.exports[name];
  });
}
