import { createThumbnail, createThumbnails } from './imagePreview';

// jsdom не умеет ни декодировать изображения, ни рисовать в canvas —
// подменяем обе точки соприкосновения с браузером.
const drawImage = jest.fn();
const toDataURL = jest.fn();

const fakeBitmap = (width: number, height: number) => ({
  width,
  height,
  close: jest.fn(),
});

const fakeFile = (name = 'photo.jpg') =>
  new File(['binary'], name, { type: 'image/jpeg' });

const mockDecodedSize = (width: number, height: number) => {
  const bitmap = fakeBitmap(width, height);
  (global as never as { createImageBitmap: jest.Mock }).createImageBitmap =
    jest.fn(async () => bitmap);
  return bitmap;
};

// jest в CRA сбрасывает реализации моков между тестами — задаём их заново
beforeEach(() => {
  toDataURL.mockReturnValue('data:image/jpeg;base64,thumb');

  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = toDataURL as never;

  mockDecodedSize(4000, 3000);
});

test('уменьшает фото по большей стороне с сохранением пропорций', async () => {
  const result = await createThumbnail(fakeFile(), 200);

  expect(result).toBe('data:image/jpeg;base64,thumb');
  // 4000x3000 при пределе 200 — это 200x150
  expect(drawImage).toHaveBeenCalledWith(
    expect.anything(),
    0,
    0,
    200,
    150,
  );
  expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.72);
});

test('маленькое фото не увеличивается', async () => {
  mockDecodedSize(80, 60);

  await createThumbnail(fakeFile(), 200);

  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 80, 60);
});

test('освобождает декодированный битмап', async () => {
  const bitmap = mockDecodedSize(1000, 1000);

  await createThumbnail(fakeFile());

  expect(bitmap.close).toHaveBeenCalled();
});

test('ошибка декодирования пробрасывается наружу', async () => {
  (global as never as { createImageBitmap: jest.Mock }).createImageBitmap =
    jest.fn(async () => {
      throw new Error('unsupported format');
    });

  await expect(createThumbnail(fakeFile())).rejects.toThrow(
    'unsupported format',
  );
});

test('пачка отдаёт миниатюры по мере готовности', async () => {
  const ready = jest.fn();
  const entries = Array.from({ length: 7 }, (_, i) => ({
    id: `file-${i + 1}`,
    file: fakeFile(`photo-${i + 1}.jpg`),
  }));

  await createThumbnails(entries, ready);

  expect(ready).toHaveBeenCalledTimes(7);
  expect(ready).toHaveBeenCalledWith('file-1', 'data:image/jpeg;base64,thumb');
});

test('файл, который не удалось уменьшить, не роняет остальную пачку', async () => {
  (global as never as { createImageBitmap: jest.Mock }).createImageBitmap = jest
    .fn()
    .mockRejectedValueOnce(new Error('unsupported format'))
    .mockImplementation(async () => fakeBitmap(1000, 1000));

  const ready = jest.fn();
  await createThumbnails(
    [
      { id: 'broken', file: fakeFile('broken.jpg') },
      { id: 'fine', file: fakeFile('fine.jpg') },
    ],
    ready,
  );

  expect(ready).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledWith('fine', 'data:image/jpeg;base64,thumb');
});
