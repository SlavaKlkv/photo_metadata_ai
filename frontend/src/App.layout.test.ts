// Регрессия: после генерации все три колонки Review скроллились одним
// общим скроллом вместе с шапкой, и низкое окно оставалось в этом режиме
// при любом изменении ширины. Причина — раскладка теряла фиксированную
// высоту: оболочка росла под контент, а панели тянулись под min-content.
import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const rule = (scss: string, selector: string) => {
  const match = scss.match(
    new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`),
  );
  expect(match).not.toBeNull();
  // Сравниваем объявления, а не комментарии внутри правила.
  return match![2].replace(/\/\*[\s\S]*?\*\//g, '');
};

const compactBlock = (scss: string) => {
  const match = scss.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*?)\n\}/);
  expect(match).not.toBeNull();
  return match![1];
};

test('оболочка приложения фиксирована по высоте вьюпорта', () => {
  const scss = read('App.module.scss');

  expect(rule(scss, '.app')).toMatch(/height:\s*100vh/);
  expect(rule(scss, '.app')).not.toMatch(/min-height:\s*100vh/);
  // Скроллится содержимое, а не документ: шапка и футер остаются на виду.
  expect(rule(scss, '.bodyContent')).toMatch(/overflow-y:\s*auto/);
});

test('колонки Review скроллятся сами, а не растягивают раскладку', () => {
  const scss = read('App.module.scss');

  expect(rule(scss, '.reviewGrid')).toMatch(/min-height:\s*0/);
  expect(rule(scss, '.reviewGrid')).not.toMatch(/min-height:\s*min-content/);
});

test('панель держится в высоте колонки и не тянется под контент', () => {
  const scss = read('components/atoms/Panel/Panel.module.scss');

  expect(rule(scss, '.panel')).toMatch(/min-height:\s*0/);
  expect(rule(scss, '.panel')).not.toMatch(/min-height:\s*min-content/);
});

test('колонка настроек скроллит себя, а не страницу', () => {
  const scss = read('components/organisms/SettingsPanel/SettingsPanel.module.scss');

  expect(rule(scss, '.settingsPanel')).toMatch(/overflow-y:\s*auto/);
  expect(rule(scss, '.controls')).toMatch(/min-height:\s*0/);
  expect(rule(scss, '.inputGroup')).toMatch(/min-height:\s*0/);
});

// Порог по высоте включал общий скролл почти в любом окне Electron
// (minHeight 640 < 700) и не выключался при расширении окна.
test.each([
  ['App.module.scss'],
  ['components/atoms/Panel/Panel.module.scss'],
  ['components/organisms/ResultsTable/ResultsTable.module.scss'],
  ['components/organisms/SettingsPanel/SettingsPanel.module.scss'],
])('%s переключает раскладку по ширине окна, а не по высоте', (file) => {
  const scss = read(file);

  expect(scss).toMatch(/@media \(max-width: 1024px\)/);
  expect(scss).not.toMatch(/@media[^{]*max-height:\s*700px[^{]*\{[\s\S]*?height:\s*auto/);
});

test('тесный режим возвращает естественную высоту блоков', () => {
  const compact = compactBlock(read('App.module.scss'));

  expect(compact).toMatch(/\.app\s*\{[^}]*height:\s*auto/s);
  expect(compact).toMatch(/\.app\s*\{[^}]*min-height:\s*100vh/s);
  expect(compact).toMatch(/\.reviewGrid\s*\{[^}]*min-height:\s*min-content/s);

  const settings = compactBlock(
    read('components/organisms/SettingsPanel/SettingsPanel.module.scss'),
  );
  expect(settings).toMatch(/overflow-y:\s*visible/);
  expect(settings).toMatch(/min-height:\s*min-content/);
});
