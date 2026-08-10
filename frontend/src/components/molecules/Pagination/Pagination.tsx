// frontend/src/components/molecules/Pagination/Pagination.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './Pagination.module.scss';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Сколько номеров показываем между закреплёнными первой и последней страницами
const WINDOW_SIZE = 3;

// Первый промежуточный номер: страница 1 закреплена отдельно
const MIDDLE_FIRST = 2;

// Накопленная дельта колеса, после которой окно сдвигается на один номер
const WHEEL_STEP_PX = 40;

// Шаг колеса в режиме DOM_DELTA_LINE (Firefox): высота кнопки + отступ
const LINE_STEP_PX = 32;

// Пауза, после которой считаем прокрутку новым жестом: первый шаг в нём
// делается сразу, без накопления порога, иначе прокрутка «не заводится»
const GESTURE_GAP_MS = 200;

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const middleLast = totalPages - 1;
  const middleCount = Math.max(0, middleLast - MIDDLE_FIRST + 1);
  const canScrollWindow = middleCount > WINDOW_SIZE;

  // Крайняя левая граница окна: дальше правого края диапазона не уезжаем
  const maxStart = Math.max(MIDDLE_FIRST, middleLast - WINDOW_SIZE + 1);
  // Сколько различных позиций может занять окно
  const positions = maxStart - MIDDLE_FIRST;

  const clampStart = useCallback(
    (start: number) => Math.min(Math.max(start, MIDDLE_FIRST), maxStart),
    [maxStart],
  );

  // Позиция окна — обычное состояние, а не позиция скролла: браузер в это
  // не вмешивается, поведение полностью предсказуемо и проверяется тестами.
  // Вместе с позицией храним направление последнего сдвига — по нему цифры
  // выбирают, с какой стороны въезжать.
  const [pageWindow, setPageWindow] = useState(() => ({
    start: clampStart(currentPage - 1),
    direction: 0,
  }));
  const wheelDelta = useRef(0);
  const lastWheelAt = useRef(0);
  // Зеркало позиции окна для обработчика колеса: он живёт в эффекте и иначе
  // видел бы значение, захваченное при подписке
  const startRef = useRef(clampStart(currentPage - 1));

  const moveWindow = useCallback((next: number) => {
    setPageWindow((prev) =>
      // окно упёрлось в границу — ни сдвига, ни направления, ни лишнего рендера
      next === prev.start
        ? prev
        : { start: next, direction: Math.sign(next - prev.start) },
    );
  }, []);

  useEffect(() => {
    startRef.current = clampStart(pageWindow.start);
  }, [pageWindow.start, clampStart]);

  // Окно едет за текущей страницей: клик по крайнему из трёх номеров сдвигает
  // его на один, переход на далёкую страницу ставит её в центр.
  useEffect(() => {
    moveWindow(clampStart(currentPage - 1));
  }, [currentPage, clampStart, moveWindow]);

  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stopDragRef = useRef<(() => void) | null>(null);

  // Доля дорожки, занятая бегунком: она же ширина окна относительно диапазона
  const thumbFraction = middleCount > 0 ? WINDOW_SIZE / middleCount : 1;

  // Ставим окно по точке, за которую взялись. Единственное место, где нужны
  // размеры элемента, — и меряем их в момент жеста, а не в рендере.
  const moveWindowToClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || positions <= 0) return;

      const { left, width } = track.getBoundingClientRect();
      if (!width) return;

      // курсор целится в центр бегунка, поэтому вычитаем его половину
      const travel = 1 - thumbFraction;
      const raw = (clientX - left) / width - thumbFraction / 2;
      const ratio = travel > 0 ? Math.min(Math.max(raw / travel, 0), 1) : 0;

      moveWindow(clampStart(MIDDLE_FIRST + Math.round(ratio * positions)));
    },
    [positions, thumbFraction, moveWindow, clampStart],
  );

  const handleTrackMouseDown = (event: React.MouseEvent) => {
    // без этого браузер начинает выделять текст под курсором
    event.preventDefault();
    moveWindowToClientX(event.clientX);

    const handleMove = (moveEvent: MouseEvent) =>
      moveWindowToClientX(moveEvent.clientX);

    const stop = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stop);
      stopDragRef.current = null;
    };

    stopDragRef.current = stop;
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stop);
  };

  // Размонтировались посреди перетаскивания — слушатели уходят вместе с нами
  useEffect(() => () => stopDragRef.current?.(), []);

  // Прокрутка колесом двигает окно, не меняя страницу. Слушатель вешаем
  // вручную: React регистрирует wheel как passive, preventDefault там нельзя.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !canScrollWindow) return;

    const handleWheel = (event: WheelEvent) => {
      const rawDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (!rawDelta) return;

      event.preventDefault();

      // deltaMode === DOM_DELTA_LINE: дельта приходит в строках, не в пикселях
      const delta =
        event.deltaMode === 1 ? rawDelta * LINE_STEP_PX : rawDelta;

      // В эту сторону окно уже упёрлось. Событие не должно расходовать ни
      // накопленный путь, ни право на мгновенный первый шаг: иначе прокрутка
      // от края начинает работать только со второго движения.
      const towardsEdge = Math.sign(delta);
      if (clampStart(startRef.current + towardsEdge) === startRef.current) {
        return;
      }

      const now = Date.now();
      const startsGesture = now - lastWheelAt.current > GESTURE_GAP_MS;
      lastWheelAt.current = now;

      // Новый жест начинается с чистого листа и сдвигает окно сразу: ждать
      // накопления порога здесь — та самая «задержка в начале прокрутки»
      if (startsGesture) {
        wheelDelta.current = 0;
      } else {
        // Развернулись — копить прежнее направление больше незачем
        if (Math.sign(delta) !== Math.sign(wheelDelta.current)) {
          wheelDelta.current = 0;
        }
        wheelDelta.current += delta;

        if (Math.abs(wheelDelta.current) < WHEEL_STEP_PX) return;
      }

      // Ровно один номер за раз: щелчок мыши на 120px иначе перепрыгивал бы
      // сразу три, и прокрутка читалась бы как рывок
      const step = startsGesture
        ? Math.sign(delta)
        : Math.sign(wheelDelta.current);

      // Остаток переносим, а не обнуляем — иначе на крупных дельтах теряется
      // часть пути и темп перестаёт следовать за скоростью жеста. Больше чем
      // на шаг вперёд не копим, чтобы очередь событий не выстрелила пачкой.
      const rest = startsGesture ? 0 : wheelDelta.current - step * WHEEL_STEP_PX;
      wheelDelta.current = Math.max(-WHEEL_STEP_PX, Math.min(WHEEL_STEP_PX, rest));

      setPageWindow((prev) => {
        const next = clampStart(prev.start + step);
        return next === prev.start
          ? prev
          : { start: next, direction: Math.sign(next - prev.start) };
      });
    };

    strip.addEventListener('wheel', handleWheel, { passive: false });
    return () => strip.removeEventListener('wheel', handleWheel);
  }, [canScrollWindow, clampStart]);

  if (totalPages <= 1) return null;

  const visibleStart = clampStart(pageWindow.start);
  const middlePages = Array.from(
    { length: Math.min(WINDOW_SIZE, middleCount) },
    (_, i) => visibleStart + i,
  );

  const hasHiddenBefore = middlePages.length > 0 && middlePages[0] > MIDDLE_FIRST;
  const hasHiddenAfter =
    middlePages.length > 0 && middlePages[middlePages.length - 1] < middleLast;

  const slideClass =
    pageWindow.direction > 0
      ? styles.slideForward
      : pageWindow.direction < 0
        ? styles.slideBack
        : '';

  // Геометрия бегунка — чистая арифметика в процентах, без замеров DOM
  const thumbWidthPct = Math.min(100, thumbFraction * 100);
  const progress = positions > 0 ? (visibleStart - MIDDLE_FIRST) / positions : 0;
  const thumbLeftPct = progress * (100 - thumbWidthPct);

  const renderPageButton = (page: number, key: React.Key = page) => {
    const isActive = page === currentPage;

    return (
      <button
        key={key}
        className={`${styles.pageBtn} ${isActive ? styles.pageBtnActive : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => onPageChange(page)}
      >
        {/* key по номеру: span пересоздаётся ровно тогда, когда в слоте
            сменилась цифра, — на этом и держится анимация въезда */}
        <span key={page} className={styles.pageNumber}>
          {page}
        </span>
      </button>
    );
  };

  // Место под многоточие держим всегда, иначе номера прыгают при прокрутке.
  const renderEllipsis = (isVisible: boolean) => {
    if (middleCount === 0) return null;

    return (
      <span
        className={`${styles.ellipsis} ${isVisible ? '' : styles.ellipsisHidden}`}
        aria-hidden="true"
      >
        …
      </span>
    );
  };

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        ←
      </button>

      {renderPageButton(1)}

      {renderEllipsis(hasHiddenBefore)}

      {middlePages.length > 0 && (
        <div className={styles.stripColumn}>
          <div
            className={`${styles.strip} ${slideClass}`}
            ref={stripRef}
            id="pagination-window"
          >
            {/* key по индексу слота, а не по номеру: кнопки-слоты остаются теми
                же узлами, поэтому подсветка не переезжает, когда окно едет */}
            {middlePages.map((page, slot) => renderPageButton(page, slot))}
          </div>

          {/* Полоска прокрутки: место под неё держим всегда, чтобы ряд не
              менял высоту, когда номера умещаются целиком */}
          <div
            className={`${styles.track} ${canScrollWindow ? '' : styles.trackHidden}`}
            ref={trackRef}
            onMouseDown={canScrollWindow ? handleTrackMouseDown : undefined}
            role="scrollbar"
            aria-label="Pages window"
            aria-orientation="horizontal"
            aria-controls="pagination-window"
            aria-valuemin={MIDDLE_FIRST}
            aria-valuemax={maxStart}
            aria-valuenow={visibleStart}
          >
            <div
              className={styles.thumb}
              style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
            />
          </div>
        </div>
      )}

      {renderEllipsis(hasHiddenAfter)}

      {renderPageButton(totalPages)}

      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        →
      </button>
    </nav>
  );
};
