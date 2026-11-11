# AI-Manager — frontend

Frontend ALL-менеджера: Next.js, React и TypeScript. Django backend находится в отдельном репозитории [ibrodevs/AI-Manager-backend](https://github.com/ibrodevs/AI-Manager-backend).

Сначала запустите backend по инструкции в его README. Затем:

```bash
cp apps/web/.env.django.example apps/web/.env.local
npx pnpm@10.33.0 install --frozen-lockfile
npx pnpm@10.33.0 dev
```

Frontend: `http://localhost:3000`. В `.env.local` задаются `DATA_SOURCE=django` и `DJANGO_API_URL=http://127.0.0.1:8000/api/v1`. Запросы к Django выполняет сервер Next.js; браузер не получает backend-токен.

Скрипт `./scripts/dev-django.sh` запускает только frontend. Backend развёртывается отдельно; его исходников в текущем дереве этого репозитория нет.

- [Подключение к Django и сквозные проверки](docs/DJANGO_MVP.md)
- [Отчёт о стабилизации этапа A](docs/PHASE_A_REPORT.md)
- [Матрица приёмки MVP](docs/MVP_ACCEPTANCE.md)
- [ТЗ v2.4](docs/TZ_ALL-manager_v2.4.pdf)

Полная приёмка ТЗ не завершена. Разделение репозиториев не меняет ранее описанные ограничения MVP.

## Состав frontend

- `apps/web`: страницы, React-компоненты, SSR и адаптер Django API.
- `packages/ui`: интерфейсные компоненты.
- `packages/types`: только TypeScript-типы API, без миграций и подключения к БД.
- `packages/dialog`, `packages/integrations`, `eval`: библиотеки и локальные проверки демонстрационных сценариев/форматов API.

Сервисы голосовой связи, воркеры, SQL-миграции и административные скрипты находятся только в backend-репозитории, в `legacy/`. Это сохранённые реализации старого контура; основной backend — Django в корне `AI-Manager-backend`.

Серверные компоненты и маршруты Next.js остаются частью frontend: они обеспечивают SSR, httpOnly-сессию и запросы к Django. Отдельный backend-сервис из этого репозитория не запускается.
