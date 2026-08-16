'use strict';

// Переключатели летающей частицы и искр бренда для index.html и screens.html.
// Значения — **отдельно по страницам**: можно выключить эффект только на главной
// или только в галерее. Подробности: docs/landing/README.md
// Подключение: <script src="ambient-particle-flags.js"></script>
// Маркер: LANDING_PARTICLE_FLAGS
//
// Искры: два независимых режима — intro и рабочий цикл.
// Значение режима: id из реестра в brand-sparkles.js или false.
// Новый intro / working: зарегистрировать runner в brand-sparkles.js и указать id здесь.

// --- LANDING_PARTICLE_FLAGS ---
// ENABLE_*: true / false.
// BRAND_SPARKLES_INTRO / BRAND_SPARKLES_WORKING:
// false | 'flow' | 'twinkle-pairs' (или id нового режима).
var LANDING_PARTICLE_FLAGS = {
  // index.html — главная
  index: {
    ENABLE_AMBIENT_PARTICLE: false,
    ENABLE_HOVER_ATTRACTION: false,
    ENABLE_BRAND_SPARKLES: true,
    BRAND_SPARKLES_INTRO: false,
    BRAND_SPARKLES_WORKING: 'twinkle-pairs',
  },
  // screens.html — галерея экранов
  screens: {
    ENABLE_AMBIENT_PARTICLE: false,
    ENABLE_HOVER_ATTRACTION: false,
    ENABLE_BRAND_SPARKLES: true,
    BRAND_SPARKLES_INTRO: false,
    BRAND_SPARKLES_WORKING: 'twinkle-pairs',
  },
};
// --- /LANDING_PARTICLE_FLAGS ---

// Режим искр: false / null / '' / 'none' → выкл; true → 'flow'; иначе строковый id.
function normalizeBrandSparklesMode(value) {
  if (value === true) return 'flow';
  if (value === false || value == null || value === '' || value === 'none') return false;
  if (typeof value === 'string') return value;
  return false;
}

// pageKey: 'index' | 'screens'.
// Возвращает флаги частицы и режимы искр (intro / working).
function getLandingParticleFlags(pageKey) {
  var cfg = LANDING_PARTICLE_FLAGS[pageKey];
  if (!cfg) {
    throw new Error('Unknown landing page particle flags key: ' + pageKey);
  }
  return {
    ENABLE_AMBIENT_PARTICLE: !!cfg.ENABLE_AMBIENT_PARTICLE,
    ENABLE_HOVER_ATTRACTION: !!cfg.ENABLE_HOVER_ATTRACTION,
    ENABLE_BRAND_SPARKLES: !!cfg.ENABLE_BRAND_SPARKLES,
    BRAND_SPARKLES_INTRO: normalizeBrandSparklesMode(cfg.BRAND_SPARKLES_INTRO),
    BRAND_SPARKLES_WORKING: normalizeBrandSparklesMode(cfg.BRAND_SPARKLES_WORKING),
  };
}
