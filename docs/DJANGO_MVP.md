# Frontend и отдельный Django backend

Репозитории:

- Frontend: https://github.com/ibrodevs/AI-Manager
- Backend: https://github.com/ibrodevs/AI-Manager-backend

## Локальный запуск

В репозитории backend:

```bash
./scripts/dev.sh --demo
```

В репозитории frontend:

```bash
cp apps/web/.env.django.example apps/web/.env.local
npx pnpm@10.33.0 install --frozen-lockfile
npx pnpm@10.33.0 dev
```

Frontend работает на порту 3000. Django API работает на порту 8000. В `apps/web/.env.local` нужны:

```dotenv
DATA_SOURCE=django
DJANGO_API_URL=http://127.0.0.1:8000/api/v1
DEMO_ENVIRONMENT=0
ALLOW_MOCK_AUTH=0
```

`DJANGO_API_URL` — серверная переменная. Запросы к Django выполняются через сервер Next.js, с httpOnly-сессией. Не добавляйте backend-токены в NEXT_PUBLIC-переменные.

## Проверки

```bash
npx pnpm@10.33.0 typecheck
npx pnpm@10.33.0 test
npx pnpm@10.33.0 eval
DATA_SOURCE=django npx pnpm@10.33.0 build
E2E_MODE=django E2E_URL=http://localhost:3000 npx pnpm@10.33.0 --filter @all/web e2e
```

Браузерные тесты требуют запущенного backend и демо-аккаунта из `seed_demo`. Для повторного запуска на той же БД укажите `E2E_TOTP_SECRET` либо используйте новую тестовую БД. Не используйте рабочие секреты.

CI `.github/workflows/django.yml` получает backend отдельным checkout в `.backend`, устанавливает Python-зависимости, применяет миграции, запускает API и проверяет frontend через браузер. Backend имеет собственный CI API/RLS.

## Общая схема анкеты

Backend содержит самостоятельную копию `core/questionnaire.json`; ему не нужен Node.js. Источник описания полей — `packages/dialog/src/questionnaire.ts` во frontend. Проверка копии в соседнем backend-репозитории:

```bash
npx pnpm@10.33.0 --filter @all/web exec tsx ../../scripts/export-backend-questionnaire.ts --output ../../../AI-Manager-backend/core/questionnaire.json --check
```

Для обновления уберите `--check` и закоммитьте изменение в backend. CI сравнивает обе схемы.

## Docker

`compose.yaml` этого репозитория запускает только frontend. Backend имеет свой `compose.yaml` с PostgreSQL, Redis, API и воркерами. По умолчанию frontend-контейнер обращается к API на хосте через `host.docker.internal:8000`; для отдельного сервера задайте его URL в `DJANGO_API_URL`.

```bash
docker compose up --build -d
```

Контейнеры в этой сессии не запускались; проверка выполнялась нативно. Подробности backend: https://github.com/ibrodevs/AI-Manager-backend/blob/main/docs/DJANGO_MVP.md

Статус требований и внешних подключений: [MVP_ACCEPTANCE.md](MVP_ACCEPTANCE.md).
