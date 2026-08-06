const fs = require('fs');

const { readVendorSpec } = require('../scripts/fetch-dmgbuild');

// Скрипт вычитывает версию бандла dmgbuild и контрольные суммы прямо из
// исходника dmg-builder, чтобы они не разъезжались с установленной
// зависимостью. Тесты фиксируют этот контракт: и разбор реального файла,
// и внятную ошибку, если структура dmg-builder изменится.
describe('readVendorSpec', () => {
  it('извлекает параметры бандла из установленного dmg-builder', () => {
    const spec = readVendorSpec();

    expect(spec.releaseName).toMatch(/^dmg-builder@/);
    expect(spec.filenameWithExt).toMatch(
      /^dmgbuild-bundle-(arm64|x86_64)-[0-9a-f]+\.tar\.gz$/
    );
    // Имя собрано под текущую архитектуру, а не осталось шаблоном.
    expect(spec.filenameWithExt).not.toContain('${arch}');
    expect(spec.checksums[spec.filenameWithExt]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('падает с понятной ошибкой, если структура dmg-builder изменилась', () => {
    const readFileSync = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('module.exports = {};');

    try {
      expect(() => readVendorSpec()).toThrow(/Не удалось разобрать параметры/);
    } finally {
      readFileSync.mockRestore();
    }
  });

  it('падает, если для нужного файла нет контрольной суммы', () => {
    const readFileSync = jest.spyOn(fs, 'readFileSync').mockReturnValue(`
      releaseName: "dmg-builder@9.9.9",
      filenameWithExt: \`dmgbuild-bundle-\${arch}-deadbee.tar.gz\`,
      checksums: {
        "dmgbuild-bundle-other-deadbee.tar.gz": "${'a'.repeat(64)}",
      },
    `);

    try {
      expect(() => readVendorSpec()).toThrow(/нет контрольной суммы/);
    } finally {
      readFileSync.mockRestore();
    }
  });
});
