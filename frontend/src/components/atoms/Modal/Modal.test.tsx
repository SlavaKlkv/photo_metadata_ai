// Регрессия: Progress/статус и остальные модалки уезжали к верхнему краю
// в типичном окне Electron — полезная высота часто < 620 при minHeight 640,
// и media query переключал оверлей на align-items: flex-start.
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

const readScss = () =>
  fs.readFileSync(path.join(__dirname, 'Modal.module.scss'), 'utf8');

test('оверлей всегда центрирует модалку по вертикали и горизонтали', () => {
  const scss = readScss();
  const overlay = scss.match(/\.overlay\s*\{([^}]*)\}/);
  expect(overlay).not.toBeNull();
  const decls = overlay![1].replace(/\/\*[\s\S]*?\*\//g, '');

  expect(decls).toMatch(/align-items:\s*center/);
  expect(decls).toMatch(/justify-content:\s*center/);
  expect(decls).toMatch(/position:\s*fixed/);
});

test('низкое или узкое окно не сдвигает модалку к верхнему краю', () => {
  const scss = readScss();

  expect(scss).not.toMatch(
    /@media[^{]*\{[^}]*align-items:\s*flex-start/,
  );
  expect(scss).toMatch(/\.modal\s*\{[^}]*margin:\s*auto/s);
});

test('рендерит содержимое, пока модалка открыта', () => {
  render(
    <Modal isOpen onClose={() => {}}>
      Processing: 0/18
    </Modal>,
  );

  expect(screen.getByText('Processing: 0/18')).toBeInTheDocument();
});
