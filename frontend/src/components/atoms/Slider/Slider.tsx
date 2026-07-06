// /Slider
// TODO: удалить, если не понадобится слайдер

/*import React from 'react';
import styles from './Slider.module.scss';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  ...props
}) => {
  // считаем процент для заливки трека слева от ползунка
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={styles.slider}
      style={{ '--fill': `${percent}%` } as React.CSSProperties}
      {...props}
    />
  );
};*/