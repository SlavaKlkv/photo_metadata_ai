// frontend/src/utils/logger.ts

// Единственная точка доступа к консоли: в dev-сборке пишем как обычно,
// а в production-сборке react-scripts на этапе сборки подставляет NODE_ENV,
// ветка с вызовом console.* становится недостижимой и вырезается
// минификатором — консоль пользователя не засоряется.
export const logger = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error(...args);
    }
  },
};
