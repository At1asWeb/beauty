# Salon MiniApp

Telegram Mini App для небольшого салона красоты: онлайн-запись 24/7, панели
мастера и администратора, уведомления через Telegram Bot, галерея работ,
отзывы и рейтинги, статистика.

## Архитектура

- **backend** — FastAPI + SQLAlchemy 2 (async) + Alembic + PostgreSQL. Авторизация
  через HMAC-валидацию `initData` Telegram Web App. Уведомления через aiogram.
- **frontend** — React 18 + Vite + TypeScript + Tailwind + `telegram-web-app.js`.
  Темы и цвета берутся из `Telegram.WebApp.themeParams` (автоматически
  подхватывает светлый/тёмный режим пользователя).

### Роли

- `client` — видит главную, категории, услуги, мастеров, делает записи, оставляет
  отзывы на завершённые визиты (один отзыв на визит).
- `master` — всё клиентское + панель мастера: расписание (недельное + даты),
  свои услуги, список записей с действиями подтвердить/отменить/завершить/неявка,
  заметки и блокировка клиентов, статистика, «стоп-бронирование».
- `admin` — всё мастерское + управление категориями/услугами/мастерами/галереей,
  назначение ролей, рассылка уведомлений.

Пользователь с `ROOT_ADMIN_TG_ID` автоматически получает роль admin при первом
входе.

## Быстрый старт (локально через Docker)

```bash
cp .env.example .env        # отредактируйте переменные ниже
docker compose up --build
```

Переменные в `.env`:

- `TELEGRAM_BOT_TOKEN` — токен от [@BotFather](https://t.me/BotFather). Без него
  уведомления не отправляются, но всё остальное работает.
- `ROOT_ADMIN_TG_ID` — ваш Telegram ID (узнать: [@userinfobot](https://t.me/userinfobot)).
  Этот пользователь получит роль admin при первом открытии мини-приложения.
- `SALON_NAME` — название салона (показывается в UI и уведомлениях).
- `DEV_MODE=true` — включает приём заголовка `X-Dev-User-Id` вместо
  `initData`, чтобы тестировать интерфейс в обычном браузере без Telegram.
  Никогда не включайте в продакшене.

Открыть: http://localhost:5173. API — http://localhost:8000 (Swagger на `/docs`).

### Тест в браузере без Telegram

Включите `DEV_MODE=true` и в консоли браузера выполните:

```js
localStorage.setItem('dev_user_id', '649990856'); // ваш tg id
location.reload();
```

## Деплой

Большинство облаков (Fly.io, Railway) требуют привязку банковской карты.
Ниже — два рабочих варианта: **Render + Neon** (без карты, только email) и
**Fly.io** (нужна карта, но инфраструктура надёжнее).

`DATABASE_URL` принимается в любой форме: `postgres://…`,
`postgresql://…`, `postgresql+asyncpg://…`, с `?sslmode=require` и без —
бекенд сам приведёт её к нужному виду при старте.

### Вариант A: Render + Neon (бесплатно, без карты)

1. **Создайте бесплатную Postgres на [Neon](https://neon.tech)**
   (signup по email, карта не нужна):
   - New Project → придумайте имя → Create.
   - На странице проекта нажмите **Connect** → скопируйте строку
     «Connection string» (формат `postgres://user:pass@...neon.tech/db?sslmode=require`).

2. **Запушьте этот репозиторий на GitHub** (он у вас уже есть — `beauty`).

3. **Создайте Blueprint на [Render](https://render.com)**:
   - Signup по email/GitHub (карта не нужна для Free-тарифа).
   - New → **Blueprint** → подключите репо → Render прочитает `render.yaml`
     и создаст 2 сервиса: `salon-backend` и `salon-frontend`.
   - На шаге confirmation Render попросит значения переменных, помеченных
     как `sync: false`:
     - `salon-backend` / `DATABASE_URL` — вставьте строку из Neon как есть
       (бекенд сам нормализует её).
     - `salon-backend` / `TELEGRAM_BOT_TOKEN` — токен от BotFather.
     - `salon-backend` / `ROOT_ADMIN_TG_ID` — ваш Telegram user id.
     - `salon-backend` / `CORS_ORIGINS` — пока оставьте
       `https://web.telegram.org`, обновим после шага 4.
     - `salon-frontend` / `VITE_API_BASE` — временно поставьте
       `https://example.com`, обновим после шага 4.

4. **После первого деплоя Render покажет URL обоих сервисов**
   (вида `https://salon-backend-xxxx.onrender.com` и
   `https://salon-frontend-xxxx.onrender.com`):
   - В настройках `salon-frontend` обновите `VITE_API_BASE` на реальный
     URL backend и нажмите **Manual Deploy → Deploy latest commit**.
   - В настройках `salon-backend` обновите `CORS_ORIGINS` на
     `https://salon-frontend-xxxx.onrender.com,https://web.telegram.org`
     и перезапустите сервис.

5. **Настройте кнопку меню у бота** в [@BotFather](https://t.me/BotFather):
   `/mybots` → ваш бот → **Bot Settings → Menu Button → Configure Menu
   Button** → URL = `https://salon-frontend-xxxx.onrender.com`.

Готово. Free-тариф Render усыпляет сервисы после 15 минут простоя; первый
запрос будить сервис ~30-60 сек, дальше всё летает. Для салона с 10-20
записями в день это норма.

### Вариант B: Fly.io (требуется карта)

1. Создайте бота у BotFather и получите токен.
2. Установите flyctl: https://fly.io/docs/flyctl/install/, `flyctl auth login`
   (потребуется привязать карту).
3. Backend:

   ```bash
   flyctl launch --no-deploy --copy-config --dockerfile backend/Dockerfile --name salon-miniapp-api
   flyctl postgres create --name salon-miniapp-db
   flyctl postgres attach --app salon-miniapp-api salon-miniapp-db
   flyctl secrets set -a salon-miniapp-api \
       TELEGRAM_BOT_TOKEN=<ваш токен> \
       ROOT_ADMIN_TG_ID=<ваш tg id> \
       SALON_NAME='Название салона' \
       CORS_ORIGINS='https://salon-miniapp-web.fly.dev,https://web.telegram.org'
   flyctl deploy -c fly.backend.toml -a salon-miniapp-api
   ```

4. Frontend:

   ```bash
   flyctl launch --no-deploy --copy-config --dockerfile frontend/Dockerfile --name salon-miniapp-web
   flyctl deploy -c fly.frontend.toml -a salon-miniapp-web \
       --build-arg VITE_API_BASE=https://salon-miniapp-api.fly.dev
   ```

5. В @BotFather укажите URL `https://salon-miniapp-web.fly.dev` в Menu Button.

### Вариант C: Railway (требуется карта)

Railway сам не умеет строить монорепо с двумя Dockerfile. Завести нужно
**3 отдельных сервиса** (Postgres, backend, frontend), каждый с
`Root Directory = backend` или `= frontend`. Подробнее — тот же сценарий
что для Render, но через Railway UI. Шаги идентичны Варианту A.

## Схема БД

Кратко (полный набор полей см. в `backend/app/models/models.py`):

- `users` — Telegram-пользователи с ролью (client/master/admin) и флагом блокировки.
- `categories`, `services` — каталог услуг; `service.duration_min` задаёт длину
  слота, `service.price` — цену по умолчанию.
- `masters` — профиль мастера 1:1 к `users`, агрегаты рейтинга, флаг
  «стоп-бронирование».
- `master_services` — какие мастера делают какие услуги (+ индивидуальные
  цена/длительность, если нужно).
- `schedules` — строки рабочих интервалов, weekday-паттерн или
  дата-override. CHECK-constraint: ровно одно из полей `weekday`/`date`.
- `bookings` — `pending → confirmed → completed | cancelled | no_show`, FK на
  клиента/мастера/услугу, фиксирует `price_at_booking`.
- `reviews` — один отзыв на `booking` (уникальность).
- `gallery_items` — URL изображений, опционально привязанные к мастеру/услуге.
- `broadcasts` — журнал рассылок админа.
- `client_notes`, `client_blocks` — заметки и блокировки мастера о клиентах.

Все миграции в `backend/alembic/versions/`; `alembic upgrade head` запускается
автоматически при старте контейнера (и как `release_command` в `fly.backend.toml`).

## Логика бронирования

`backend/app/services/booking_logic.py`:

- `compute_available_slots(master, service, day)` — берёт недельный график
  мастера (с override по дате), режет на шаги по 30 мин, выбрасывает слоты,
  пересекающиеся с уже существующими `pending/confirmed` записями, и слоты
  короче длительности услуги.
- При создании записи проверяется: мастер активен, не «остановлен», клиент не
  заблокирован у этого мастера, слот не занят (защита от дублей — при гонке
  вторая заявка получит 409).

## API

Сгенерированный Swagger: http://localhost:8000/docs

Основные маршруты:

- `GET /api/me` — профиль + роль + название салона.
- `GET /api/categories` / `POST /PATCH /DELETE` (admin).
- `GET /api/services?category_id=…` / `POST /PATCH /DELETE` (admin).
- `GET /api/masters?service_id=…`, `GET /api/masters/{id}`.
- `POST /api/masters` (admin), `PATCH /DELETE /api/masters/{id}`.
- `POST /api/masters/{id}/stop-booking`.
- `GET/POST/DELETE /api/masters/{id}/services` (master/admin).
- `GET/PUT /api/masters/{id}/schedule` (master/admin).
- `GET /api/masters/{id}/slots?service_id=…&day=YYYY-MM-DD`.
- `GET /api/masters/{id}/reviews`.
- `GET /api/masters/{id}/stats`.
- `GET/PUT /api/masters/{id}/clients/{cid}/note` (master/admin).
- `GET/POST/DELETE /api/masters/{id}/blocks[/{cid}]`.
- `POST /api/bookings`, `GET /api/bookings/my`, `GET /api/bookings/master/{id}`,
  `PATCH /api/bookings/{id}`.
- `POST /api/reviews` (client для своего завершённого визита).
- `GET/POST/DELETE /api/gallery` (чтение всем, запись admin).
- `GET /api/admin/users`, `PATCH /api/admin/users/{id}/role?role=…`.
- `POST /api/admin/broadcasts`.

Аутентификация — заголовок `Authorization: tma <initData>` на каждом запросе;
бекенд сам верифицирует HMAC и сопоставляет Telegram-юзера с нашей `users`.

## Что можно добавить дальше

Эти пункты намеренно оставлены на следующий релиз (не критичны для работы
приложения, сообщите, если нужны):

- Загрузка изображений галереи с устройства (сейчас — только URL, удобно
  хранить на Cloudinary/Supabase Storage).
- Экспорт статистики в CSV, красивые графики.
- Интеграция онлайн-платежей (Telegram Stars или внешний эквайринг).
- Поддержка нескольких салонов (multi-tenant).
- Push через Telegram Bot о напоминаниях за N часов до визита (легко
  добавить cron-джобом в backend).
