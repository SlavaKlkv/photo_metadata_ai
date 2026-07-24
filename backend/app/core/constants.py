# Ограничения и поддерживаемые форматы изображений.
ALLOWED_IMAGE_TYPES = {'image/jpeg'}
ALLOWED_IMAGE_SUFFIXES = {'.jpg', '.jpeg'}

# Форматы, которые Pillow может распознать в JPEG-совместимом контейнере.
# MPO (Multi Picture Object) — JPEG-совместимый контейнер камер
# Panasonic/Fujifilm; file(1)/Finder видят его как JPEG, а Pillow —
# как format='MPO'. Первый кадр читается штатно, поэтому принимаем наравне
# с JPEG.
ALLOWED_IMAGE_FORMATS = {'JPEG', 'MPO'}
