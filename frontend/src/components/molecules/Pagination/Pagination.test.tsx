import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

const pageButton = (page: number | string) =>
  screen.getByRole('button', { name: String(page) });

const stripOf = (container: HTMLElement) =>
  container.querySelector('#pagination-window') as HTMLElement;

const trackOf = () => screen.getByRole('scrollbar');

const thumbOf = (container: HTMLElement) =>
  trackOf().firstElementChild as HTMLElement;

// jsdom не считает layout — размеры дорожки задаём вручную,
// в браузере их даёт getBoundingClientRect в момент жеста.
const fakeTrackWidth = (width: number, left = 0) => {
  trackOf().getBoundingClientRect = () =>
    ({ left, width, right: left + width, top: 0, bottom: 3, height: 3 }) as DOMRect;
};

// Номера окна между закреплёнными первой и последней страницами
const windowNumbers = (container: HTMLElement) =>
  Array.from(stripOf(container).querySelectorAll('button')).map(
    (button) => button.textContent,
  );

// Индекс слота, в котором стоит подсветка; -1 — подсветки в окне нет
const activeSlot = (container: HTMLElement) =>
  Array.from(stripOf(container).querySelectorAll('button')).findIndex(
    (button) => button.getAttribute('aria-current') === 'page',
  );

test('не рендерится, когда страница всего одна', () => {
  const { container } = render(
    <Pagination currentPage={1} totalPages={1} onPageChange={jest.fn()} />,
  );

  expect(container).toBeEmptyDOMElement();
});

test('первая и последняя страницы закреплены, между ними три номера', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(pageButton(1)).toBeInTheDocument();
  expect(pageButton(20)).toBeInTheDocument();
  expect(windowNumbers(container)).toEqual(['5', '6', '7']);
});

test('окно едет за текущей страницей', () => {
  const { container, rerender } = render(
    <Pagination currentPage={1} totalPages={11} onPageChange={jest.fn()} />,
  );

  // у самого начала диапазона окно прижато к левому краю
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);

  rerender(
    <Pagination currentPage={2} totalPages={11} onPageChange={jest.fn()} />,
  );
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);

  rerender(
    <Pagination currentPage={7} totalPages={11} onPageChange={jest.fn()} />,
  );
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // у конца диапазона окно прижимается к правому краю
  rerender(
    <Pagination currentPage={11} totalPages={11} onPageChange={jest.fn()} />,
  );
  expect(windowNumbers(container)).toEqual(['8', '9', '10']);
});

test('клик по крайнему из трёх сдвигает окно ровно на один', async () => {
  const onPageChange = jest.fn();
  const { container, rerender } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={onPageChange} />,
  );
  expect(windowNumbers(container)).toEqual(['5', '6', '7']);

  // правый номер окна
  await userEvent.click(pageButton(7));
  expect(onPageChange).toHaveBeenCalledWith(7);
  rerender(
    <Pagination currentPage={7} totalPages={20} onPageChange={onPageChange} />,
  );
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // левый номер окна
  await userEvent.click(pageButton(6));
  expect(onPageChange).toHaveBeenCalledWith(6);
  rerender(
    <Pagination currentPage={6} totalPages={20} onPageChange={onPageChange} />,
  );
  expect(windowNumbers(container)).toEqual(['5', '6', '7']);
});

test('переход на страницу вне окна ставит её в центр', () => {
  const { container, rerender } = render(
    <Pagination currentPage={3} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);

  rerender(
    <Pagination currentPage={15} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['14', '15', '16']);
  expect(pageButton(15)).toHaveAttribute('aria-current', 'page');
});

test('колесо двигает окно по одному номеру, не меняя страницу', () => {
  const onPageChange = jest.fn();
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={onPageChange} />,
  );
  const strip = stripOf(container);

  fireEvent.wheel(strip, { deltaY: 40 });
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // один щелчок мыши — ровно один номер, а не три
  fireEvent.wheel(strip, { deltaY: 120 });
  expect(windowNumbers(container)).toEqual(['7', '8', '9']);

  // прокрутка — только просмотр: страница не менялась, а окно уехало от неё
  expect(onPageChange).not.toHaveBeenCalled();
  expect(activeSlot(container)).toBe(-1);
});

test('первое движение сдвигает окно сразу, без накопления порога', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );

  // мелкая дельта в начале жеста: ждать порога здесь — это задержка старта
  fireEvent.wheel(stripOf(container), { deltaY: 15 });

  expect(windowNumbers(container)).toEqual(['6', '7', '8']);
});

test('после паузы прокрутка снова отзывается с первого движения', () => {
  jest.useFakeTimers();

  try {
    const { container } = render(
      <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
    );
    const strip = stripOf(container);

    fireEvent.wheel(strip, { deltaY: 15 });
    expect(windowNumbers(container)).toEqual(['6', '7', '8']);

    // внутри жеста мелкие движения копятся до целого шага
    fireEvent.wheel(strip, { deltaY: 15 });
    expect(windowNumbers(container)).toEqual(['6', '7', '8']);

    // руку убрали и вернулись — это новый жест, шаг снова мгновенный
    jest.advanceTimersByTime(300);
    fireEvent.wheel(strip, { deltaY: 15 });
    expect(windowNumbers(container)).toEqual(['7', '8', '9']);
  } finally {
    jest.useRealTimers();
  }
});

test('от края окно едет с первого движения, а не со второго', () => {
  const { container } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  // упёрлись влево и продолжаем крутить в стену — окно стоит
  fireEvent.wheel(strip, { deltaY: -10 });
  fireEvent.wheel(strip, { deltaY: -10 });
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);

  // разворот: щелчки в стену не должны были съесть право на мгновенный шаг
  fireEvent.wheel(strip, { deltaY: 10 });
  expect(windowNumbers(container)).toEqual(['3', '4', '5']);
});

test('у правого края разворот тоже срабатывает сразу', () => {
  const { container } = render(
    <Pagination currentPage={19} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  fireEvent.wheel(strip, { deltaY: 10 });
  fireEvent.wheel(strip, { deltaY: 10 });
  expect(windowNumbers(container)).toEqual(['17', '18', '19']);

  fireEvent.wheel(strip, { deltaY: -10 });
  expect(windowNumbers(container)).toEqual(['16', '17', '18']);
});

test('очередь событий даёт по одному номеру на событие', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  // 5 событий по 120px — 5 номеров, а не 15
  for (let i = 0; i < 5; i += 1) {
    fireEvent.wheel(strip, { deltaY: 120 });
  }

  expect(windowNumbers(container)).toEqual(['10', '11', '12']);
});

test('мелкие движения внутри жеста копятся до целого шага', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  // первое движение жеста — сразу шаг
  fireEvent.wheel(strip, { deltaY: 15 });
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // дальше шаг наступает по накоплении пути, а не по таймеру
  fireEvent.wheel(strip, { deltaY: 15 });
  fireEvent.wheel(strip, { deltaY: 15 });
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  fireEvent.wheel(strip, { deltaY: 15 });
  expect(windowNumbers(container)).toEqual(['7', '8', '9']);
});

test('смена направления сбрасывает накопленную дельту', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  // первое движение жеста — сразу шаг вперёд
  fireEvent.wheel(strip, { deltaY: 30 });
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // развернулись, не добрав до шага — накопленное вперёд не должно
  // вычитаться из обратного хода, поэтому пока никуда не едем
  fireEvent.wheel(strip, { deltaY: -30 });
  expect(windowNumbers(container)).toEqual(['6', '7', '8']);

  // добрали обратный путь до шага — окно едет назад ровно на один номер
  fireEvent.wheel(strip, { deltaY: -30 });
  expect(windowNumbers(container)).toEqual(['5', '6', '7']);
});

test('колесо в строчном режиме шагает сразу на номер', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );

  // DOM_DELTA_LINE — дельта приходит в строках (Firefox)
  fireEvent.wheel(stripOf(container), { deltaY: 2, deltaMode: 1 });

  expect(windowNumbers(container)).toEqual(['6', '7', '8']);
});

test('окно не выходит за границы диапазона', () => {
  const { container } = render(
    <Pagination currentPage={6} totalPages={11} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  for (let i = 0; i < 10; i += 1) fireEvent.wheel(strip, { deltaY: 120 });
  expect(windowNumbers(container)).toEqual(['8', '9', '10']);

  for (let i = 0; i < 10; i += 1) fireEvent.wheel(strip, { deltaY: -120 });
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
});

test('колесо не перехватывается, когда двигать окно некуда', () => {
  const { container } = render(
    <Pagination currentPage={2} totalPages={5} onPageChange={jest.fn()} />,
  );

  const wheelAllowed = fireEvent.wheel(stripOf(container), { deltaY: 120 });

  // событие не отменено — скролл достаётся панели результатов
  expect(wheelAllowed).toBe(true);
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
});

test('при малом числе страниц номера идут подряд без многоточий', () => {
  render(<Pagination currentPage={3} totalPages={5} onPageChange={jest.fn()} />);

  expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(5);
  screen.getAllByText('…').forEach((node) => {
    expect(node).toHaveClass('ellipsisHidden');
  });
});

test('многоточия видны ровно там, где окно скрывает номера', () => {
  const { rerender } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );

  // окно у левого края — скрыты только номера справа
  expect(screen.getAllByText('…')[0]).toHaveClass('ellipsisHidden');
  expect(screen.getAllByText('…')[1]).not.toHaveClass('ellipsisHidden');

  // окно в середине — скрыто с обеих сторон
  rerender(
    <Pagination currentPage={10} totalPages={20} onPageChange={jest.fn()} />,
  );
  screen.getAllByText('…').forEach((node) => {
    expect(node).not.toHaveClass('ellipsisHidden');
  });

  // окно у правого края — скрыты только номера слева
  rerender(
    <Pagination currentPage={20} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(screen.getAllByText('…')[0]).not.toHaveClass('ellipsisHidden');
  expect(screen.getAllByText('…')[1]).toHaveClass('ellipsisHidden');
});

test('в середине диапазона подсветка стоит на месте, а цифры едут', () => {
  const { container, rerender } = render(
    <Pagination currentPage={7} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['6', '7', '8']);
  expect(activeSlot(container)).toBe(1);

  rerender(
    <Pagination currentPage={8} totalPages={20} onPageChange={jest.fn()} />,
  );

  // тот же слот остаётся подсвеченным — переезжает не рамка, а цифры
  expect(activeSlot(container)).toBe(1);
  expect(windowNumbers(container)).toEqual(['7', '8', '9']);
});

test('у левого края цифры стоят, а подсветка переходит на выбранный номер', () => {
  const { container, rerender } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
  expect(activeSlot(container)).toBe(0);

  rerender(
    <Pagination currentPage={3} totalPages={20} onPageChange={jest.fn()} />,
  );

  // окно упёрлось в границу — двигаться может только подсветка
  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
  expect(activeSlot(container)).toBe(1);
});

test('у правого края подсветка тоже переходит по слотам', () => {
  const { container, rerender } = render(
    <Pagination currentPage={19} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['17', '18', '19']);
  expect(activeSlot(container)).toBe(2);

  rerender(
    <Pagination currentPage={18} totalPages={20} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['17', '18', '19']);
  expect(activeSlot(container)).toBe(1);
});

test('на коротком списке окно не ездит — подсветка переходит по номерам', () => {
  const { container, rerender } = render(
    <Pagination currentPage={2} totalPages={5} onPageChange={jest.fn()} />,
  );

  expect(activeSlot(container)).toBe(0);

  rerender(
    <Pagination currentPage={4} totalPages={5} onPageChange={jest.fn()} />,
  );

  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
  expect(activeSlot(container)).toBe(2);
});

test('окно помечает направление сдвига, а на упоре — не помечает', () => {
  const { container, rerender } = render(
    <Pagination currentPage={7} totalPages={20} onPageChange={jest.fn()} />,
  );
  const strip = stripOf(container);

  // сами keyframes jsdom не проигрывает — проверяем выбор направления
  rerender(
    <Pagination currentPage={8} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(strip).toHaveClass('slideForward');

  rerender(
    <Pagination currentPage={6} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(strip).toHaveClass('slideBack');

  // упор в границу: окно не поехало, направления нет
  rerender(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(strip).toHaveClass('slideBack');
  rerender(
    <Pagination currentPage={3} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(strip).toHaveClass('slideBack');
});

test('бегунок показывает долю видимых номеров и позицию окна', () => {
  const { container, rerender } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );

  // видно 3 номера из 18 промежуточных
  const thumb = thumbOf(container);
  expect(thumb.style.width).toBe(`${(3 / 18) * 100}%`);
  expect(thumb.style.left).toBe('0%');

  // окно у правого упора — бегунок в конце дорожки
  rerender(
    <Pagination currentPage={20} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(thumbOf(container).style.left).toBe(`${100 - (3 / 18) * 100}%`);
  expect(trackOf()).toHaveAttribute('aria-valuenow', '17');
});

test('клик по дорожке переносит окно в эту точку', () => {
  const onPageChange = jest.fn();
  const { container } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={onPageChange} />,
  );

  fakeTrackWidth(180);
  fireEvent.mouseDown(trackOf(), { clientX: 180 });

  // дальний конец дорожки — правый упор окна
  expect(windowNumbers(container)).toEqual(['17', '18', '19']);
  // полоска только прокручивает, страницу не переключает
  expect(onPageChange).not.toHaveBeenCalled();
});

test('бегунок тянется мышью и не выходит за края', () => {
  const { container } = render(
    <Pagination currentPage={2} totalPages={20} onPageChange={jest.fn()} />,
  );

  fakeTrackWidth(180);
  fireEvent.mouseDown(trackOf(), { clientX: 0 });
  fireEvent.mouseMove(window, { clientX: 90 });
  expect(windowNumbers(container)).toEqual(['10', '11', '12']);

  // тянем далеко за пределы дорожки — окно упирается, а не улетает
  fireEvent.mouseMove(window, { clientX: 5000 });
  expect(windowNumbers(container)).toEqual(['17', '18', '19']);

  fireEvent.mouseUp(window);

  // после отпускания движение мыши больше не двигает окно
  fireEvent.mouseMove(window, { clientX: 0 });
  expect(windowNumbers(container)).toEqual(['17', '18', '19']);
});

test('дорожка скрыта и не реагирует, когда прокручивать нечего', () => {
  const { container } = render(
    <Pagination currentPage={2} totalPages={5} onPageChange={jest.fn()} />,
  );

  expect(trackOf()).toHaveClass('trackHidden');

  fakeTrackWidth(180);
  fireEvent.mouseDown(trackOf(), { clientX: 180 });

  expect(windowNumbers(container)).toEqual(['2', '3', '4']);
});

test('стрелки сдвигают страницу на единицу', async () => {
  const onPageChange = jest.fn();
  render(
    <Pagination currentPage={4} totalPages={20} onPageChange={onPageChange} />,
  );

  await userEvent.click(screen.getByRole('button', { name: /previous page/i }));
  expect(onPageChange).toHaveBeenCalledWith(3);

  await userEvent.click(screen.getByRole('button', { name: /next page/i }));
  expect(onPageChange).toHaveBeenCalledWith(5);
});

test('стрелки заблокированы на краях диапазона', () => {
  const { rerender } = render(
    <Pagination currentPage={1} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled();

  rerender(
    <Pagination currentPage={20} totalPages={20} onPageChange={jest.fn()} />,
  );
  expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
});
