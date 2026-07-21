// frontend/src/utils/imagePreview.ts

// Ссылка на исходный файл в <img> заставляет браузер декодировать
// полноразмерное фото ради миниатюры 56px — на переключении страниц это
// заметная задержка. Поэтому уменьшаем картинку один раз при загрузке.
const THUMBNAIL_MAX_SIZE = 200;
const THUMBNAIL_QUALITY = 0.72;

// Сколько файлов обрабатываем одновременно: пачка бывает в сотни фото,
// и декодировать их все разом — верный способ упереться в память.
const CONCURRENCY = 4;

export const createThumbnail = async (
  file: File,
  maxSize = THUMBNAIL_MAX_SIZE,
): Promise<string> => {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not supported');
  }

  // Декодирование идёт вне главного потока — интерфейс не замирает
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2d context is not available');
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  } finally {
    bitmap.close();
  }
};

/**
 * Готовит миниатюры пачками и отдаёт готовые через onReady, чтобы вызывающий
 * код мог заменять превью по мере готовности, а не ждать всю пачку.
 * Файлы, которые не удалось уменьшить (экзотический формат), пропускаются —
 * для них остаётся исходная ссылка.
 */
export const createThumbnails = async (
  entries: Array<{ id: string; file: File }>,
  onReady: (id: string, thumbnail: string) => void,
): Promise<void> => {
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;

      try {
        onReady(entry.id, await createThumbnail(entry.file));
      } catch {
        // формат не по зубам браузеру — оставляем исходное превью
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker),
  );
};
