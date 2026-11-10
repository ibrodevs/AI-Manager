# AI-Manager — frontend

Этот репозиторий содержит Next.js frontend и общие UI/TypeScript-библиотеки. Backend: https://github.com/ibrodevs/AI-Manager-backend.

Не добавляйте сюда Django, голосовые сервисы, очереди, SQL-миграции и provisioning БД. Бизнес-данные в основном режиме читаются и изменяются через Django API. Сессия хранится в httpOnly cookie сервером Next.js. Секреты и аргументы авторизации не логируются.

В `packages/types` только типы API. Mock-данные и локальные демонстрации предназначены для разработки интерфейса. Дизайн — `docs/design.md`, требования — ТЗ v2.4, текущее состояние — `docs/MVP_ACCEPTANCE.md`.

Проверки: `pnpm typecheck`, `pnpm test`, `pnpm build`, интеграционный CI `.github/workflows/django.yml`.
