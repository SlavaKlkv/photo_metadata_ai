import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

const getFill = () => screen.getByRole('progressbar').firstElementChild;

test('clamps the value into 0..100', () => {
  const { rerender } = render(<ProgressBar value={-10} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

  rerender(<ProgressBar value={140} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
});

test('animates the width by default', () => {
  render(<ProgressBar value={50} />);

  expect(getFill()).not.toHaveClass('instant');
});

test('drops the width transition when smooth is off', () => {
  // При пошаговом прогрессе анимация ширины даёт заметное отставание
  // полосы от цифры — ровно та жалоба, из-за которой появился проп
  render(<ProgressBar value={50} smooth={false} />);

  expect(getFill()).toHaveClass('instant');
});
