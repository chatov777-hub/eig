# DESIGN.md — спецификация Material 3 для ЕИГ v5

Правило номер один: **ни одного `box-shadow`**. Иерархия строится тонами поверхностей,
а не тенями. Все цвета — только через токены `--md-sys-color-*` из `css/tokens.css`.

## 1. Цветовые токены

Светлая тема объявлена на `:root`. Тёмная — дважды с одинаковым содержимым:
`@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) }` и `:root[data-theme="dark"]`.
Так системная тема и ручной переключатель работают в обе стороны.

| Роль | Light | Dark |
|---|---|---|
| primary / on-primary | `#006C4C` / `#FFFFFF` | `#72DBAB` / `#003824` |
| primary-container / on- | `#8FF7C6` / `#002114` | `#005236` / `#8FF7C6` |
| secondary / on-secondary | `#006876` / `#FFFFFF` | `#86D2E1` / `#00363E` |
| secondary-container / on- | `#9EEFFF` / `#001F24` | `#004F59` / `#9EEFFF` |
| tertiary / on-tertiary | `#9C4238` / `#FFFFFF` | `#FFB4A9` / `#5F1410` |
| tertiary-container / on- | `#FFDAD5` / `#410002` | `#7D2B23` / `#FFDAD5` |
| amber / -container / on- | `#7A5900` / `#FFDF9E` / `#261A00` | `#F5C048` / `#5B4200` / `#FFDF9E` |
| error / -container / on- | `#BA1A1A` / `#FFDAD6` / `#410002` | `#FFB4AB` / `#93000A` / `#FFDAD6` |
| surface / on-surface | `#FBFDF9` / `#191C1A` | `#111418` / `#E1E2E8` |
| on-surface-variant | `#3F4944` | `#BFC9C2` |
| outline / outline-variant | `#6F7973` / `#BFC9C2` | `#89938C` / `#3F4944` |
| container-lowest → highest | `#FFFFFF` `#F4F7F3` `#EEF1ED` `#E8ECE7` `#E2E6E1` | `#0C0F13` `#191C20` `#1D2024` `#282A2F` `#33353A` |

**Режим дня → тон:** peak → secondary, heavy → primary, medium → amber, light → tertiary, rest → error.
Чип режима: `background: var(--md-sys-color-{тон}-container)`, `color: var(--md-sys-color-on-{тон}-container)`.

Форма: `--md-sys-shape-corner-large: 20px`, `-extra-large: 28px`, `-full: 9999px`. Высота навигации `--nav-h: 80px`.

## 2. Типографика

Google Fonts: `Roboto Flex` (8..144, 400..700), `Google Sans Flex` (400..700), `Material Symbols Rounded`.
Стек: `'Google Sans Flex','Roboto Flex',Roboto,system-ui,sans-serif`.

| Класс | Размер / интерлиньяж | Вес |
|---|---|---|
| `.display-m` | 45 / 52, трекинг −0.25 | 400 |
| `.headline-s` | 24 / 32 | 400 |
| `.title-l` | 22 / 28 | 400 |
| `.title-m` | 16 / 24 | 500 |
| `.body-l` | 16 / 24 | 400 |
| `.body-m` | 14 / 20 | 400 |
| `.label-l` | 14 / 20 | 500 |
| `.label-m` | 12 / 16 | 500 |
| `.label-s` | 11 / 16 | 500 |

Все числовые метрики — `.num` (`font-variant-numeric: tabular-nums`), чтобы цифры не прыгали.

## 3. Компоненты

| Компонент | Токены и метрики |
|---|---|
| `.card` | `surface-container-low`, радиус 24px, паддинг 20px |
| `.tile` (вложенная плитка) | `surface-container-high`, радиус 16px, паддинг 14px |
| `.btn-filled` | `primary` / `on-primary`, высота 48px, паддинг 0 24px, радиус full |
| `.btn-tonal` | `secondary-container` / `on-secondary-container`, те же метрики |
| `.btn-text` | прозрачный, текст `primary` |
| `.chip` | 32px, радиус full, рамка `outline-variant`; `.chip.on` → `secondary-container` |
| `.seg` (сегмент) | рамка `outline`, радиус full, кнопки 40px, активная `secondary-container` |
| Слайдер | трек 4px `surface-container-highest`, активная часть `primary`, ползунок 20px `primary`, риски — точки 4px `outline-variant` |
| Top App Bar | 64px; аватар-круг 40px `primary-container` с первой буквой имени; приветствие `title-m`, дата `label-m`; справа чип стрика, тема, настройки |
| Navigation Bar | 80px + `env(safe-area-inset-bottom)`; 4 пункта; иконка Material Symbols 24px в pill 64×32, у активного `secondary-container`; подпись `label-m`. Иконки: `wb_sunny`, `fitness_center`, `calendar_month`, `list_alt` |
| Bottom sheet `.sheet` | `surface-container-low`, верхние углы 28px, ручка 32×4 `outline-variant`, `max-height: 85vh`, затемнение `rgba(0,0,0,.4)` |
| Таймер-бар | `surface-container-high`, верхние углы 20px, над nav; в состоянии «отдых окончен» — `error-container` |
| `.motiv` | `primary-container` / `on-primary-container`, радиус 24px, эмодзи 32px слева, текст `body-l`; для `decline_two_weeks` и `missed` — `tertiary-container` |
| Карточки пресетов | 3 в ряд, `surface-container-high`, активная — `primary-container` + рамка `primary` 2px; иконка 32px, имя `title-m`, подпись `label-s` |
| Пипсы подходов | 44×44, радиус full, рамка `outline`; сделанный — `primary` / `on-primary` |
| Ячейка календаря | `surface-container`, радиус 12px, `aspect-ratio: 1`, gap 4px; сегодня — `outline: 2px primary` |
| Барабан пикера | высота 200px, `scroll-snap-type: y mandatory`, элемент 40px, паддинг 80px сверху/снизу, маска-градиент, центральная полоса `surface-container-highest` радиус 12px |

## 4. Сетка и экран «Сегодня»

`main` — одна колонка, `max-width: 640px`, боковые поля 16px, нижний отступ `var(--nav-h) + safe-area + 24px`.
Карточки идут подряд с зазором 12px.

Порядок на «Сегодня» сверху вниз:

1. Top App Bar
2. Плашка мотивации
3. Hero-карточка с кольцами (индекс `display-m` в центре, под ним чип режима, снизу легенда колец)
4. Карточка «Тренировка сегодня»: заголовок режима, строка-настройка, плитка с сессией и CTA «Начать →»
5. Опросник: 6 шкал 0–4 + часы сна, кнопки «Рассчитать индекс» (filled) и «Сброс» (text)
6. Неделя: 3 карточки пресетов + `details` «Настроить» (дни, тип, чипы Пн…Вс, время, «Сегодня делаю»)
7. Quick Stats 2×2: Zone 2 за неделю / цель 190, тоннаж недели, стрик, средний индекс за 7 дней
8. Футер-оговорка

## 5. Кольца

`viewBox="0 0 200 200"`, радиусы 88 / 70 / 52, `stroke-width: 14`, `stroke-linecap: round`, поворот −90°.
Трек — `outline-variant` с `stroke-opacity: .35`. Прогресс — `stroke-dasharray = C`, `stroke-dashoffset = C·(1−p)`,
переход `.6s`. Заливка — линейный градиент от токена к нему же с `opacity .6`.
Значения: индекс/100, сделанные подходы / запланированные, тренировки недели / план.
