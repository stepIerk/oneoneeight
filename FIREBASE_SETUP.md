# Настройка Firebase для «Расписание группы 118»

Файлы конспектов хранятся в **Yandex Object Storage** — см. `YANDEX_STORAGE.md`.

## 1. Вставить firebaseConfig

Открой `client/src/firebase/config.js` и вставь конфиг из
**Firebase Console → Project settings → General → Your apps → SDK setup → Config**.
Пока конфиг пуст — приложение работает на локальном `schedule.json` (fallback-режим).

## 2. Создать админа и старосту (регистрации через сайт нет)

1. **Authentication → Sign-in method** — убедись, что включён Email/Password.
2. **Authentication → Users → Add user** — создай пользователя (email + пароль).
3. Скопируй его **UID**.
4. **Firestore Database → Start collection**:
   - для админа — коллекция `admins`, ID документа = **UID**, поле `email`;
   - для старосты (удаление конспектов) — коллекция `leaders`, ID = **UID**.

## 3. Опубликовать правила безопасности

- `firestore.rules` → **Firestore → Rules** → вставить содержимое → Publish.

## 4. Хранилище конспектов

Бакет + функция-пресайнер — по шагам в `YANDEX_STORAGE.md`.
Адрес функции указать в `client/.env.local`: `VITE_PRESIGNER_URL=...`

## 5. Первый импорт расписания

1. Открой сайт → внизу «Для админа» (`/#/admin`) → войди.
2. Вкладка **«Шаблон недели»** → кнопка **«Импортировать из JSON»** —
   локальный `schedule.json` переносится в Firestore (`schedule/template`).
3. Дальше редактируй шаблон прямо в панели.

## Модель данных

| Где | Что | Кто пишет |
|---|---|---|
| `schedule/template` | недельный шаблон (структура = старому schedule.json) | админ |
| `dayOverrides/{YYYY-MM-DD}` | расписание конкретной даты (полностью заменяет шаблон этого дня недели) | админ |
| `notes/{id}` | конспекты: subject, title, url (файл из Storage), storagePath | админ |
| `lessonLinks/{id}` | ссылки к предметам | **любой посетитель** добавляет, удаляет админ |
| `announcements/{id}` | объявления | админ |
| `admins/{uid}` | список админов | вручную в Console |
| Storage `notes/...` | файлы конспектов | админ |

## Логика навигации

- Главное страница листается **по датам**: ‹ день ›, свайп, табы дней недели
  с числами, кнопка «Сегодня».
- Кнопки недели (‹ ›) листают на 7 дней; недели показывают один и тот же
  шаблон, **пока** для конкретной даты не создано переопределение
  (`dayOverrides`). Такие даты помечаются чипом «изменено».

## Адрес админки

GitHub Pages не переписывает URL, поэтому роутер — hash-based:
`https://<user>.github.io/oneoneeight/#/admin`
