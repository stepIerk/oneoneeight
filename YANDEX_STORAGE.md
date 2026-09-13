# Yandex Object Storage для конспектов

Файлы конспектов хранятся в **Yandex Cloud Object Storage** (S3-совместимом).
Ключи доступа **не попадают на сайт** — их держит Yandex Cloud Function,
которая выдаёт только временные pre-signed URL.

```
Браузер (все) ──POST──▶ API Gateway ──▶ Function (ключи в env)
                              │
                              ▼
                    pre-signed PUT URL (10 мин)
Браузер ───────PUT файла напрямую в Yandex Object Storage───────▶ бакет

Браузер (староста) ──POST {idToken, key}──▶ Function проверяет роль
                              ▼
                    pre-signed DELETE URL
```

## 1. Настроить бакет (консоль Yandex Cloud)

1. **Бакет → «Общедоступный доступ»**: «Чтение объектов» = **PUBLIC**
   (чтобы все могли открывать загруженные конспекты по ссылке).
2. **CORS** — выполните один раз локально (скрипт, см. ниже) или через
   консоль (бакет → CORS):
   - AllowedMethods: `PUT, DELETE, GET, HEAD`
   - AllowedOrigins: `https://stepierk.github.io`, `http://localhost:5173`
   - AllowedHeaders: `*`

Скрипт CORS (без зависимостей; ключи указываются в переменных, не коммитятся):

```bash
YA_BUCKET=имя-бакета \
YA_ACCESS_KEY_ID=YCAJ... \
YA_SECRET_ACCESS_KEY=YCPJ... \
node scripts/set-bucket-cors.js
```

> В скрипте запрос подписывается вручную (SigV4): свежие версии AWS SDK
> добавляют заголовки, от которых Yandex Object Storage отвечает
> `400 BadRequest` на PutBucketCors.

## 2. Создать Function-пресайнер

1. **Cloud Functions → Create function**:
   - Runtime: `nodejs18` (или новее)
   - Код: zip из папки `functions/presigner/` (index.js + package.json +
     `node_modules` — выполните `npm install` внутри папки перед архивацией)
   - Точка входа: `handler` (экспортируется в index.js)
2. **Переменные окружения** функции (ключи — только здесь):
   - `YA_ACCESS_KEY_ID` — идентификатор статического ключа
   - `YA_SECRET_ACCESS_KEY` — секретный ключ
   - `YA_BUCKET` — имя бакета
   - `FIREBASE_API_KEY` — Web API key проекта Firebase (публичный)
   - `FIREBASE_PROJECT_ID` — projectId Firebase
3. Сервисный аккаунт функции: создайте SA с ролью `serverless.functions.invoker`.
4. **API Gateway → Create** → вставьте `functions/presigner/apigw-spec.yaml`,
   подставив `function_id` и `service_account_id` → получите публичный домен
   вида `https://d5d....apigw.yandexcloud.net`.

## 3. Указать адрес пресайнера на сайте

Создайте `client/.env.local`:

```
VITE_PRESIGNER_URL=https://d5d....apigw.yandexcloud.net
```

Для продакшена добавьте эту переменную в GitHub Actions
(`.github/workflows/deploy.yml`, шаг Build) как env или GitHub Secret.

## 4. Роль «староста»

Как админ (`admins/{uid}`), только коллекция **`leaders`**:

Firestore → Start collection → `leaders` → документ с ID = **UID** старосты
(любое поле, например `email`). Староста входит через `/#/admin`
(увидит «Вы вошли как староста») и после этого может удалять конспекты
на главной странице.

## Права

| Действие | Кто |
|---|---|
| Открыть/скачать конспект | все |
| Добавить конспект (файл или ссылку) | все |
| Удалить конспект | староста (`leaders`) или админ (`admins`) |
| Изменить расписание, ссылки, объявления | только админ |

## Ограничения

- Размер файла: 25 МБ (проверка на клиенте). Жёсткий лимит pre-signed PUT
  невозможен — при необходимости ограничьте размер бакета или используйте
  Captcha/rate-limit на API Gateway.
- Имя файла очищается функцией (безопасные символы), ключ = `notes/<ts>-<имя>`.
