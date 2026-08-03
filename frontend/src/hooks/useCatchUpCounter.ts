// frontend/src/hooks/useCatchUpCounter.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface CatchUpCounterOptions {
  /** Период шага догона, мс */
  stepMs?: number;
  /** Пока false, счётчик замирает на текущем значении */
  enabled?: boolean;
  /** За сколько шагов счётчик обязан догнать цель при большом отставании */
  maxSteps?: number;
}

export interface CatchUpCounter {
  displayed: number;
  reset: (value?: number) => void;
}

const DEFAULT_STEP_MS = 40;
const DEFAULT_MAX_STEPS = 25;

/**
 * Плавно догоняет целевое значение по одному номеру.
 *
 * Сервер отдаёт прогресс редкими скачками (опрос раз в сотни миллисекунд, а
 * быстрая операция укладывается в один-два замера), поэтому пользователь
 * видел только 0 и финал. Хук проигрывает промежуточные номера сам, а при
 * большом отставании увеличивает шаг, чтобы не отстать навсегда.
 */
export const useCatchUpCounter = (
  target: number,
  options: CatchUpCounterOptions = {},
): CatchUpCounter => {
  const {
    stepMs = DEFAULT_STEP_MS,
    enabled = true,
    maxSteps = DEFAULT_MAX_STEPS,
  } = options;

  // На первом рендере встаём сразу на цель: догонять там нечего, а если
  // компонент смонтировался посреди прогона, честное значение важнее анимации
  const [displayed, setDisplayed] = useState(target);

  // Цель читаем из ref внутри интервала: пересоздавать таймер на каждом
  // изменении target значило бы сбрасывать фазу шага
  const targetRef = useRef(target);
  targetRef.current = target;

  const stepsRef = useRef(maxSteps);
  stepsRef.current = Math.max(1, maxSteps);

  const reset = useCallback((value = 0) => {
    setDisplayed(value);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      setDisplayed((current) => {
        const goal = targetRef.current;

        if (current === goal) return current;

        const distance = goal - current;

        // Назад счётчик не отматываем плавно: прогресс перезапустили,
        // и промежуточные номера старого прогона показывать незачем
        if (distance < 0) return goal;

        const step = Math.max(1, Math.ceil(distance / stepsRef.current));

        return Math.min(goal, current + step);
      });
    }, stepMs);

    return () => clearInterval(timer);
  }, [enabled, stepMs]);

  return { displayed, reset };
};
