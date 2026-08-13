import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { InfoCard } from './InfoCard';

const readScss = () =>
  fs.readFileSync(path.join(__dirname, 'InfoCard.module.scss'), 'utf8');

test('renders title and description', () => {
  const { container } = render(
    <InfoCard title="AI Metadata" description="Analyzes photos" />,
  );

  const text = container.querySelector('.text');
  expect(text).toHaveTextContent('AI Metadata');
  expect(text).toHaveTextContent('Analyzes photos');
});

// jsdom не считает раскладку, поэтому размеры задаём вручную.
const mockTextSize = ({
  client,
  scroll,
  width = 200,
}: {
  client: number;
  scroll: number;
  width?: number;
}) => {
  const values = {
    clientHeight: client,
    scrollHeight: scroll,
    clientWidth: width,
  };

  const apply = (sizes: Record<string, number>) =>
    Object.entries(sizes).forEach(([prop, value]) =>
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        value,
      }),
    );

  apply(values);

  return () => apply({ clientHeight: 0, scrollHeight: 0, clientWidth: 0 });
};

// Полный текст живёт в отдельном узле подсказки: видимый текст обрезан
// клампом и остаётся в потоке, поэтому раскрытие не двигает сетку.
test('clipped text is duplicated into a tooltip hidden from screen readers', () => {
  const restore = mockTextSize({ client: 36, scroll: 90 });

  const { container } = render(
    <InfoCard title="AI Metadata" description="Analyzes photos" />,
  );

  const tooltip = container.querySelector('.tooltip');
  expect(tooltip).toHaveTextContent('AI Metadata');
  expect(tooltip).toHaveTextContent('Analyzes photos');
  // Диктор читает основной текст, дубль не должен попадать в вывод.
  expect(tooltip).toHaveAttribute('aria-hidden', 'true');

  restore();
});

// Иначе подсказка дублировала бы полностью видимый текст.
test('tooltip is not rendered while the whole text fits', () => {
  const restore = mockTextSize({ client: 36, scroll: 36 });

  const { container } = render(
    <InfoCard title="AI Metadata" description="Analyzes photos" />,
  );

  expect(container.querySelector('.tooltip')).toBeNull();

  restore();
});

// Регрессия: в самом узком окне карточка сжата до значка, а блок текста
// схлопнут в точку — строки внутри целые, и по ним обрезку не увидеть.
// Текст должен оставаться доступным по наведению.
test('collapsed card keeps the tooltip with the whole text', () => {
  const restore = mockTextSize({ client: 1, scroll: 1, width: 1 });

  const { container } = render(
    <InfoCard title="AI Metadata" description="Analyzes photos" />,
  );

  const tooltip = container.querySelector('.tooltip');
  expect(tooltip).toHaveTextContent('AI Metadata');
  expect(tooltip).toHaveTextContent('Analyzes photos');

  restore();
});

// Ограничение по строкам — страховка от слишком высокой карточки, а не
// обрезка по умолчанию: в широкой колонке описание в четыре строки
// помещается целиком.
test('visible text is line-clamped, tooltip text is not', () => {
  const scss = readScss();

  expect(scss).toMatch(/\.text h4\s*\{[^}]*-webkit-line-clamp:\s*3/s);
  expect(scss).toMatch(/\.text p\s*\{[^}]*-webkit-line-clamp:\s*4/s);
  // Кламп навешен только на видимый текст: в подсказке текст полный.
  expect(scss).not.toMatch(/\.tooltip (h4|p)\s*\{[^}]*line-clamp/s);
});

// Регрессия: transition на базовом правиле подсказки давал вспышку
// подсказок при смене раскладки карточек.
test('tooltip appears on hover and focus without an enter transition on base', () => {
  const scss = readScss();

  expect(scss).toMatch(/\.tooltip\s*\{[^}]*opacity:\s*0[^}]*transition:\s*none/s);
  expect(scss).toMatch(
    /\.card:hover \.tooltip,\s*\.card:focus-visible \.tooltip\s*\{[^}]*opacity:\s*1[^}]*transition:\s*[^}]*opacity var\(--transition-fast\)/s,
  );
});

// Регрессия: карточка занимает всю колонку сетки (пустот между колонками
// нет), но не расплывается в низкую длинную полосу на широком окне.
test('card fills its column and keeps a floor on its height', () => {
  const scss = readScss();

  const card = scss.match(/\.card\s*\{([^}]*)\}/);
  expect(card).not.toBeNull();
  // Сравниваем объявления, а не комментарии внутри правила.
  const decls = card![1].replace(/\/\*[\s\S]*?\*\//g, '');

  expect(decls).toMatch(/width:\s*100%/);
  expect(decls).not.toMatch(/max-width/);
  expect(decls).toMatch(/min-height:\s*min\(11cqw,\s*160px\)/);
  // Стандартный размер плашки под иконку — не тянется за шириной колонки.
  expect(scss).toMatch(/\.icon\s*\{[^}]*width:\s*48px;\s*height:\s*48px/s);
});

// Узкая колонка перестраивает карточку по шагам, чтобы она не становилась
// узкой и высокой: иконка над текстом → короткое описание → только иконка.
test('narrow columns restack the card step by step', () => {
  const scss = readScss();

  expect(scss).toMatch(
    /@container upload \(max-width: 975px\)\s*\{\s*\.card\s*\{[^}]*flex-direction:\s*column/,
  );
  expect(scss).toMatch(
    /@container upload \(max-width: 687px\)\s*\{\s*\.text p\s*\{\s*-webkit-line-clamp:\s*2/,
  );
  // Только иконка — текст скрыт визуально, но не от экранного диктора.
  const iconMode = scss.match(
    /@container upload \(max-width: 527px\)\s*\{([\s\S]*?)\n\}/,
  );
  expect(iconMode).not.toBeNull();
  expect(iconMode![1]).toMatch(/clip-path:\s*inset\(50%\)/);
  expect(iconMode![1]).not.toMatch(/display:\s*none/);
});
