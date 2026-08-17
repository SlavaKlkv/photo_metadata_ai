# Лендинг (GitHub Pages)

Статические страницы из `docs/` публикуются на
**<https://slavaklkv.github.io/photo_metadata_ai/landing/>**

> [!NOTE]
> Это чистый HTML без сборки: браузер и Pages не читают `.env` приложения.
> Конфиг лендинга задаётся в самой странице или в этом README.
> Устройство кинематики и искр описано в комментариях модулей.

[Структура](#структура) ·
[Две страницы](#две-страницы-без-общего-шаблона) ·
[Шапка](#шапка) ·
[Узкий экран](#узкий-экран) ·
[OG-картинка](#og-картинка) ·
[Флаги эффектов](#флаги-эффектов)

## Структура

| Файл | Назначение |
| --- | --- |
| `index.html` | Главная |
| `screens.html` | Галерея экранов |
| `ambient-particle-flags.js` | Флаги частицы и искр, отдельно для `index` и `screens` |
| `mac-desktop.js` | Класс `is-mac` / `not-mac`: `.dmg` только на Mac desktop |
| `brand-iris/` | Диафрагма логотипа |
| `brand-sparkles.js` | Искры у бренда |
| `header-swap.js` | Смена пунктов шапки index ↔ screens |
| `icon.svg` | Исходник фирменной тёмной плитки для PNG-фавиконов |
| `favicon-48.png` | Плитка PNG 48×48 для Google Search |
| `apple-touch-icon.png` | Та же плитка 180×180 для Home Screen |
| `icon-192.png` | Та же плитка 192×192 для JSON-LD `logo` |
| `logo.svg` | Метка без плитки для вкладок браузера и мокапа окна |
| `og.png` | Картинка для соцсетей, собирается из `.hero-visual` |

Скриншоты приложения — каталог и правила копий в
[`../screenshots/`](../screenshots/README.md). Корень Pages
([`../index.html`](../index.html)) сразу уводит на `landing/`.

## Две страницы без общего шаблона

`index.html` и `screens.html` — самостоятельные документы: у каждой свои стили,
разметка, скрипты и SEO. Так лендинг публикуется без сборки, а правки главной
не задевают галерею.

Общими остаются модули из таблицы выше и визуальный контракт: палитру
нужно дублировать в обоих HTML.

> [!WARNING]
> Цвета обновляйте в обоих HTML. Флаги частицы и искр меняются только в
> `ambient-particle-flags.js`.

## Шапка

Диафрагма, искры и переход между страницами — одна система шапки.

| Что | Где смотреть | Как устроено |
| --- | --- | --- |
| Диафрагма | [`brand-iris/`](./brand-iris) | Не картинка, а процедурный ирис. Ход задаётся одним числом: −1 раскрыто, 0 покой (как в `icon.svg`), +1 затвор закрыт. Без JS и при `prefers-reduced-motion` остаётся статичная метка из SVG. |
| Искры | [`brand-sparkles.js`](./brand-sparkles.js) | На десктопе intro выключено, рабочий режим `'twinkle-pairs'`: раз в 3–6 секунд в свободном месте поблёскивает крупный знак 11px; половина импульсов — двойной знак со спутником и кольцом. Прежний поток 4×4 сохранён как режим `'flow'`, но выключен. На touch/coarse остаётся отдельная одиночная вспышка 8 или 11px без пар. Слой не перехватывает клики. |
| Переход index ↔ screens | [`header-swap.js`](./header-swap.js) + `brand-iris/handoff.js` | Срабатывает только по клику на соседнюю страницу: соседи гаснут, бренд переезжает FLIP-анимацией. Якоря, скролл, Back/Forward и F5 этот переход не запускают. |

Скрипты подключаются обычными `<script>` в порядке зависимостей: сборки нет,
модули общаются через `globalThis`.

## Узкий экран

Отдельного мобильного HTML нет: те же `index.html` и `screens.html`
перестраиваются медиазапросами. Ширина ломает сетки, тип указателя —
эффекты (частица, искры).

| Порог | Где | Что меняется |
| --- | --- | --- |
| 1000 px | index | Герой в одну колонку: мокап под текст |
| 900 px | index | Мастер — вертикальный таймлайн; три площадки — две колонки |
| 860 px | index | Вместо ленты ссылок — бургер и та же `#nav-links` панелью |
| 720 px | обе | Одна колонка. На главной нет дыхащего пятна за героем и мелких превью. В галерее карточки в один столбец, лайтбокс на весь экран (`100%` / `100dvh`, не `100vw`) |
| 420 px | index | Кнопки действий («Скачать», «Как это работает») встают друг под друга |
| `(hover: none)` / `(pointer: coarse)` | обе | Летающая частица убирается со страницы. Искры — редкая вспышка, см. [Шапка](#шапка). В галерее подсказка «Открыть» видна без наведения |

Кнопки `.dmg` и подпись `.cta-note` скрываются не по ширине, а классом
`html.not-mac` из [`mac-desktop.js`](./mac-desktop.js): iPad (в т.ч. с
desktop UA), iPhone, Windows и Android не видят скачивание; узкое окно на
Mac — видит. Без JS кнопка остаётся (аудитория — macOS).

Горизонтального скролла быть не должно: на `html` и `body` стоит
`overflow-x: clip` и `overscroll-behavior-x: none`. Safari при `hidden`
зумит страницу из-за резины.

Правила дублируются в обоих HTML, как и палитра. Контракт проверяют
[`desktop/tests/landing-responsive.test.js`](../../desktop/tests/landing-responsive.test.js)
и [`desktop/tests/landing-mac-desktop.test.js`](../../desktop/tests/landing-mac-desktop.test.js).

## OG-картинка

`og.png` — не отдельный макет: окно приложения рендерится из блока `.hero-visual`
на `index.html`. Картинку достаточно пересобрать:

```bash
cd desktop && npm run build:og
```

Скрипт — [`desktop/scripts/build-og.js`](../../desktop/scripts/build-og.js):
headless Chrome снимает 1200×630 при `--force-device-scale-factor=2`
(2400×1260, как в `og:image:width/height`). Анимации входа глушатся через
`prefers-reduced-motion`, иначе окно попадёт в кадр в случайной фазе.

> [!TIP]
> Если Chrome лежит не в `/Applications`, задайте путь переменной `CHROME_PATH`.

Pre-commit пересобирает `og.png` и добавляет его в коммит, если в коммит попала
`docs/landing/index.html`:

```bash
cd desktop && npm run hooks:install
```

| Деталь | Как есть |
| --- | --- |
| Исходник | [`desktop/scripts/hooks/pre-commit`](../../desktop/scripts/hooks/pre-commit) |
| Куда ставится | `.git/hooks` (в worktree — общий каталог хуков репозитория) |
| Чужой хук с тем же именем | не перезаписывается без `--force` |
| Машина без Chrome | коммит не рушится, печатается предупреждение |

## Флаги эффектов

Файл: [`ambient-particle-flags.js`](./ambient-particle-flags.js)  
Маркер: `LANDING_PARTICLE_FLAGS`.

У `index` и `screens` свой набор значений. Страницы сами флаги не задают —
только выбирают ключ (`getLandingParticleFlags('index')` / `'screens'`).

| Флаг | Смысл |
| --- | --- |
| `ENABLE_AMBIENT_PARTICLE` | Летающая частица. `false` — элемент убирается из DOM, анимация не стартует. |
| `ENABLE_HOVER_ATTRACTION` | Притяжение пятна к курсору. Код follow остаётся; `true` снова включает захват. |
| `ENABLE_BRAND_SPARKLES` | Искры у бренда. `false` — слой `.brand-sparkles` убирается из DOM. |
| `BRAND_SPARKLES_INTRO` | Intro-режим искр. Сейчас `false`; `'flow'` включает прежний фронт появления. |
| `BRAND_SPARKLES_WORKING` | Рабочий режим искр. `'twinkle-pairs'` — редкие одиночные/парные вспышки с кольцом; `'flow'` — прежний поток со сменой курса; `false` — без цикла. |

Новый intro или рабочий режим:

1. Добавить runner в `BRAND_SPARKLES_INTRO_MODES` / `BRAND_SPARKLES_WORKING_MODES` в [`brand-sparkles.js`](./brand-sparkles.js) (или через `brandSparklesRegisterIntroMode` / `brandSparklesRegisterWorkingMode`).
2. Указать id режима во флагах страницы вместо `'flow'` или `false`.

> [!NOTE]
> `prefers-reduced-motion: reduce` отключает частицу и искры независимо от этих флагов.
> На touch/coarse intro и рабочий цикл не используются — там своя редкая вспышка.
