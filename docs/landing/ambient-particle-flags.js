'use strict';

// Переключатели летающей частицы для index.html и screens.html.
// Значения — **отдельно по страницам**: можно выключить частицу только на главной
// или только в галерее. Подробности: docs/landing/README.md
// Подключение: <script src="ambient-particle-flags.js"></script>
// Маркер: LANDING_PARTICLE_FLAGS

// --- LANDING_PARTICLE_FLAGS ---
// Значения: true / false.
var LANDING_PARTICLE_FLAGS = {
  // index.html — главная
  index: {
    ENABLE_AMBIENT_PARTICLE: true,
    ENABLE_HOVER_ATTRACTION: false,
  },
  // screens.html — галерея экранов
  screens: {
    ENABLE_AMBIENT_PARTICLE: true,
    ENABLE_HOVER_ATTRACTION: false,
  },
};
// --- /LANDING_PARTICLE_FLAGS ---

// pageKey: 'index' | 'screens'. Возвращает { ENABLE_AMBIENT_PARTICLE, ENABLE_HOVER_ATTRACTION }.
function getLandingParticleFlags(pageKey) {
  var cfg = LANDING_PARTICLE_FLAGS[pageKey];
  if (!cfg) {
    throw new Error('Unknown landing page particle flags key: ' + pageKey);
  }
  return {
    ENABLE_AMBIENT_PARTICLE: !!cfg.ENABLE_AMBIENT_PARTICLE,
    ENABLE_HOVER_ATTRACTION: !!cfg.ENABLE_HOVER_ATTRACTION,
  };
}
