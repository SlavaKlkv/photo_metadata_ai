'use strict';

// Mac desktop vs iPad/телефон/Windows: .dmg только там, где приложение ставится.
// Подключение в <head> до <style>, чтобы класс not-mac был до первой отрисовки.
// Без JS кнопка остаётся видимой — аудитория лендинга macOS.
// Маркер: LANDING_MAC_DESKTOP

function isMacDesktop(nav) {
  nav = nav || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav) return false;

  var ua = nav.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return false;

  // iPadOS 13+: «сайт для компьютера» → Macintosh / MacIntel, но maxTouchPoints > 1.
  var touchPoints = nav.maxTouchPoints || 0;
  if (touchPoints > 1) {
    var platform = nav.platform || '';
    if (platform === 'MacIntel' || /Macintosh/i.test(ua)) return false;
  }

  var uaData = nav.userAgentData;
  if (uaData && typeof uaData.platform === 'string' && uaData.platform) {
    return uaData.platform === 'macOS';
  }

  if (/Mac|Macintosh/i.test(nav.platform || '')) return true;
  if (/Macintosh/i.test(ua)) return true;
  return false;
}

function applyMacDesktopClass(root, nav) {
  root = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!root || !root.classList) return isMacDesktop(nav);

  var mac = isMacDesktop(nav);
  root.classList.toggle('is-mac', mac);
  root.classList.toggle('not-mac', !mac);
  return mac;
}

if (typeof document !== 'undefined' && document.documentElement) {
  applyMacDesktopClass();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isMacDesktop: isMacDesktop,
    applyMacDesktopClass: applyMacDesktopClass,
  };
}
