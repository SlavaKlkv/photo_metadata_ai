# Лендинг (GitHub Pages)

Статические страницы публикуются из `docs/` на  
https://slavaklkv.github.io/photo_metadata_ai/landing/

| Файл | Назначение |
| --- | --- |
| `index.html` | Главная |
| `screens.html` | Галерея экранов |
| `ambient-particle-flags.js` | Флаги летающей частицы (`index` / `screens` отдельно) |
| `icon.svg`, `og.png` | Фавикон и OG-картинка |

Это чистый HTML без сборки и без `.env`: браузер и Pages не подхватывают env-переменные
приложения. Конфиг лендинга — прямо в странице (или в этом README).

## Две отдельные страницы, без общего шаблона

`index.html` и `screens.html` — **два самодостаточных HTML-документа**. Общего layout/partial
(`header.html`, `_base`, include через SSG) нет: у каждой страницы свои `<head>`, стили,
разметка и скрипты.

### Зачем так

| Причина | Суть |
| --- | --- |
| Без сборки | Лендинг живёт на GitHub Pages из `docs/`: открыл HTML — готово. Шаблон (eleventy, jinja, partials) потребовал бы шаг генерации, который здесь сознательно не нужен. |
| Разные задачи | Главная — маркетинговый сценарий (hero, CTA, FAQ, установка). `screens.html` — галерея скриншотов: другая структура, другой объём CSS/JS, другой SEO (`canonical`, title, description). |
| Изоляция регрессий | Правка галереи не ломает главную и наоборот. Общий шаблон дал бы связанность там, где страницы почти не пересекаются. |
| Прозрачность диффа | Весь код страницы в одном файле: ревью и правки без охоты по partial'ам. |

### Что «общего» всё же есть

Не полный шаблон, а **сознательный дубляж контракта** и один файл флагов частицы:

- палитра и токены (`:root` / CSS-переменные) — визуально одна система;
- sticky-шапка, тёмный canvas, favicon / OG;
- флаги ambient-частицы — [`ambient-particle-flags.js`](./ambient-particle-flags.js): одна точка правки, **значения разделены по страницам**.

При смене цветов обновляйте оба HTML. Флаги частицы — только в `ambient-particle-flags.js` (блоки `index` / `screens`).

## OG-картинка собирается из мокапа главной

`og.png` — не отдельный макет: окно приложения на ней рендерится из блока `.hero-visual`
самой `index.html` вместе со всеми стилями страницы. Поэтому мокап живёт в одном месте,
а картинку достаточно пересобрать.

```bash
cd desktop && npm run build:og
```

Скрипт — [`desktop/scripts/build-og.js`](../../desktop/scripts/build-og.js): рендерит страницу
в headless Chrome (1200×630 при `--force-device-scale-factor=2` → 2400×1260, ровно как
объявлено в `og:image:width/height`) и перезаписывает `og.png`. Анимации входа и «плавания»
глушатся через `prefers-reduced-motion`, иначе окно попадёт в кадр в случайной фазе.
Если Chrome лежит не в `/Applications`, путь задаётся переменной `CHROME_PATH`.

Чтобы не помнить об этом вручную, есть pre-commit хук — пересобирает `og.png` и добавляет
его в коммит, если в коммит попала `docs/landing/index.html`:

```bash
cd desktop && npm run hooks:install
```

Исходник хука — [`desktop/scripts/hooks/pre-commit`](../../desktop/scripts/hooks/pre-commit),
ставится в `.git/hooks` (в worktree — общий каталог хуков репозитория). Чужой хук с тем же
именем не перезаписывается без `--force`. Отключить: удалить `.git/hooks/pre-commit`.
На машине без Chrome хук не рушит коммит, а печатает предупреждение.

## Переключатели ambient-частицы

Файл: [`ambient-particle-flags.js`](./ambient-particle-flags.js)  
Маркер для поиска: `LANDING_PARTICLE_FLAGS`.

| Флаг | Смысл |
| --- | --- |
| `ENABLE_AMBIENT_PARTICLE` | Вся летающая частица. `false` — элемент убирается из DOM, анимация и слушатели не стартуют. |
| `ENABLE_HOVER_ATTRACTION` | Притяжение пятна к курсору. Код follow остаётся; `true` снова включает захват. |

Значения **не общие на весь лендинг**: у `index` и `screens` свой набор. Можно выключить частицу
только на главной, только в галерее или настроить hover независимо.

Правка: `true`/`false` в объекте `LANDING_PARTICLE_FLAGS.index` или `.screens` в
`ambient-particle-flags.js`. HTML-страницы сами не задают значения — только выбирают ключ
(`getLandingParticleFlags('index')` / `getLandingParticleFlags('screens')`).

`prefers-reduced-motion: reduce` по-прежнему отключает частицу на стороне CSS/JS
независимо от этих флагов.
