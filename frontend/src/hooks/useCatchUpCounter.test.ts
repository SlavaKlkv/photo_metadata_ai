import { act, renderHook } from '@testing-library/react';
import { useCatchUpCounter } from './useCatchUpCounter';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('shows the target immediately on the first render', () => {
  // Компонент мог смонтироваться посреди прогона — доигрывать чужие
  // номера с нуля незачем
  const { result } = renderHook(() => useCatchUpCounter(7));

  expect(result.current.displayed).toBe(7);
});

test('catches up to a new target one number at a time', () => {
  const { result, rerender } = renderHook(
    ({ target }) => useCatchUpCounter(target),
    { initialProps: { target: 0 } },
  );

  rerender({ target: 3 });

  act(() => {
    jest.advanceTimersByTime(40);
  });
  expect(result.current.displayed).toBe(1);

  act(() => {
    jest.advanceTimersByTime(40);
  });
  expect(result.current.displayed).toBe(2);

  act(() => {
    jest.advanceTimersByTime(80);
  });
  expect(result.current.displayed).toBe(3);
});

test('enlarges the step when the lag is big', () => {
  // 100 файлов при maxSteps=25 — шаг 4, иначе счётчик отстал бы навсегда
  const { result, rerender } = renderHook(
    ({ target }) => useCatchUpCounter(target),
    { initialProps: { target: 0 } },
  );

  rerender({ target: 100 });

  act(() => {
    jest.advanceTimersByTime(40);
  });

  expect(result.current.displayed).toBe(4);
});

test('never overshoots the target', () => {
  const { result, rerender } = renderHook(
    ({ target }) => useCatchUpCounter(target),
    { initialProps: { target: 0 } },
  );

  rerender({ target: 2 });

  act(() => {
    jest.advanceTimersByTime(4000);
  });

  expect(result.current.displayed).toBe(2);
});

test('freezes while disabled', () => {
  const { result, rerender } = renderHook(
    ({ target, enabled }) => useCatchUpCounter(target, { enabled }),
    { initialProps: { target: 0, enabled: true } },
  );

  rerender({ target: 10, enabled: false });

  act(() => {
    jest.advanceTimersByTime(1000);
  });

  expect(result.current.displayed).toBe(0);
});

test('snaps back when the target drops', () => {
  const { result, rerender } = renderHook(
    ({ target }) => useCatchUpCounter(target),
    { initialProps: { target: 10 } },
  );

  rerender({ target: 0 });

  act(() => {
    jest.advanceTimersByTime(40);
  });

  expect(result.current.displayed).toBe(0);
});

test('resets to the given value on demand', () => {
  const { result } = renderHook(() => useCatchUpCounter(5));

  act(() => {
    result.current.reset(0);
  });

  expect(result.current.displayed).toBe(0);
});

test('clears the timer on unmount', () => {
  const { unmount, rerender } = renderHook(
    ({ target }) => useCatchUpCounter(target),
    { initialProps: { target: 0 } },
  );

  rerender({ target: 50 });
  unmount();

  expect(jest.getTimerCount()).toBe(0);
});
