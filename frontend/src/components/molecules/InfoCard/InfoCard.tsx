// InfoCard molecule component
import React, { useLayoutEffect, useRef, useState } from 'react';
import styles from './InfoCard.module.scss';

export interface InfoCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

// Текст обрезан, если он не помещается в отведённые строки или скрыт целиком.
const isClipped = (text: HTMLElement) => {
  // Карточка сжалась до одной иконки: блок текста схлопнут в точку, строки
  // внутри при этом остаются целыми — по ним обрезку не увидеть.
  if (text.clientWidth <= 1 || text.clientHeight <= 1) return true;

  return Array.from(text.children).some((child) => {
    const node = child as HTMLElement;
    if (!node.textContent?.trim()) return false;
    return node.clientHeight === 0 || node.scrollHeight > node.clientHeight + 1;
  });
};

export const InfoCard: React.FC<InfoCardProps> = ({ icon, title, description }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  // Подсказка нужна только там, где текст действительно не поместился:
  // иначе на широком окне она дублировала бы полностью видимый текст.
  // Ширина колонки меняется вместе с окном и сайдбаром, поэтому следим
  // за размерами, а не проверяем один раз.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const check = () => setClipped(isClipped(text));
    check();

    // В тестовой среде ResizeObserver отсутствует — разовой проверки хватает.
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(check);
    observer.observe(text);
    return () => observer.disconnect();
  }, [title, description]);

  return (
    // Видимый текст обрезается по числу строк (в самом узком окне карточка
    // сжимается до одной иконки), а полный раскрывается подсказкой по
    // наведению — tabIndex оставляет её доступной с клавиатуры, когда
    // наведение недоступно.
    <div className={styles.card} tabIndex={0} aria-label={title}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.text} ref={textRef}>
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      {/* Отдельная копия текста для подсказки: видимый текст остаётся в
          потоке, поэтому раскрытие не меняет высоту карточки и не двигает
          сетку. Для экранного диктора скрыта — он читает основной текст. */}
      {clipped && (
        <div className={styles.tooltip} aria-hidden="true">
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
      )}
    </div>
  );
};
