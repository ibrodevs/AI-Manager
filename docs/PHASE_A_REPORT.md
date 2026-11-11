# Этап A — frontend и интеграция с Django

Дата: 11 ноября 2026. Исходный main: `15e6020a363eb6035f7d7aa3ab20c2d395ca4521`.
Backend source: `ec7b01bab5cf7fe3ffaf6ca8476e70ff77255513` из отдельного `ibrodevs/AI-Manager-backend`, закреплён в `.github/workflows/django.yml`. Обновление пары делается явной заменой этого SHA после проверки backend. PR backend: https://github.com/ibrodevs/AI-Manager-backend/pull/1 .

## Общий результат

PARTIALLY COMPLETED: frontend/backend и сквозные проверки прошли локально и в GitHub Actions; полный Docker Compose/Redis/Celery-контур остаётся NOT VERIFIED. В проверенном контуре незакрытых Critical/High дефектов не обнаружено.
Нативный Django/PostgreSQL-контур проверен без mock fallback, платных моделей и реальной телефонии. Ветка: `fix/phase-a-stabilization`, main не изменён.

## Дефекты и исправления

| ID | Severity | File | Problem / Cause | Fix | Verification |
| --- | --- | --- | --- | --- | --- |
| A-01 | High | `.github/workflows/django.yml` | Runner не группирует аргументы healthcheck одиночными кавычками: Docker получает `-U` как свой флаг | `--health-cmd=pg_isready` и отдельный SQL connect/SELECT до тестов | Подтверждено исходным job log 129808868142; backend CI после аналогичного исправления уже SUCCESS |
| A-05 | Medium | `.github/workflows/django.yml` | Незакреплённый backend main, HTTP API на superuser, readiness-loop продолжал работу после timeout | Точный backend SHA, непривилегированный API, явный exit при неготовности; диагностические логи в artifact | Локальный E2E под NOSUPERUSER/NOBYPASSRLS; удалённый integration CI SUCCESS |
| A-07 | Medium | `apps/web/lib/django.ts` | 5xx показывался как ошибка введённых данных; network/JSON ошибки теряли понятный контекст | Отдельные DjangoError 503/502 и понятные сообщения для 5xx | Vitest: 401/403/404/409/500/503, network и некорректный JSON не дают успешного action/revalidation |
| A-08 | Medium | `apps/web/app/api/read/[kind]/[id]/route.ts` | Отказ Django 403/404 превращался в общий 500 в detail API | Сохранение HTTP-статуса DjangoError | Vitest для 401/403/404/503, браузерный тест бухгалтера |
| A-09 | High | `apps/web/lib/env.ts` | Старый ALLOW_MOCK_AUTH=1 разрешал mock-сессии в production | Mock-вход всегда выключен в NODE_ENV=production | Регрессия с DATA_SOURCE=mock и ALLOW_MOCK_AUTH=1 |
| A-10 | Medium | `apps/web/e2e/django.spec.ts` | Не было браузерных проверок logout/status/KB/ограничений; повторный TOTP-прогон ждал отсутствующий setup code даже при переданном секрете | Расширение сценариев и условное чтение setup-кода | Chromium 10/10 PASS |

Изменены также `README.md`; добавлены `test/django.test.ts` и `test/django-read-route.test.ts`. Дизайн не изменялся. Отдельные Supabase/mock/legacy режимы не объявляются работающей Django-интеграцией.

## Подтверждённые цепочки

| UI | Handler / Django contract | Сохранение / проверка |
| --- | --- | --- |
| Login | PasswordLoginForm → loginWithPassword → auth/login, auth/session | TOTP setup, httpOnly cookie, сессия переживает reload; logout отзывает её в Django |
| Leads | CreateLeadSheet / LeadCard → createLead / updateLead → commands/createLead, commands/updateLead | Contact/Lead/LeadEvent в PostgreSQL; отдельное REST-чтение, reload, статус и история |
| Knowledge | KnowledgeView → setField/publishQuestionnaire/rollbackQuestionnaire → одноимённые commands | Черновик, опубликованный snapshot, новая версия отката; export подтверждает неизменность старой публикации |
| Assistant | assistantMessage → djangoAssistantTurn → assistantContext/assistantCommit | Опубликованный snapshot → ограниченный локальный движок → Message/Conversation/Lead в PostgreSQL |
| Company settings | updateCompany → commands/updateCompany | Значение сохраняется после reload, реальная линия остаётся выключенной |
| Roles | бухгалтер входит через UI после тестового invite/accept | CRM перенаправляет в billing, backend leads и detail proxy возвращают 403 |

Проверены все включённые экраны кабинета: calls, contacts, knowledge, assistant, inbox, calendar, analytics, team, billing, company/notifications/security settings, integrations. Календарь/Inbox/подписанные события и межтенантная изоляция дополнительно покрыты backend-тестами на PostgreSQL; не все их операции имеют отдельный браузерный тест.

В Django-ветках repo/actions нет автоматического переключения на mock при отказе backend. Тест неизвестной цены принимает уточняющий вопрос или передачу администратору и запрещает выдуманную сумму. Диалог и настоящая заявка независимо прочитаны из API.

## Проверки

- `pnpm@10.33.0 install --frozen-lockfile`: PASS.
- `check:boundary`, `typecheck`: PASS.
- `lint`: PASS, **0 errors / 27 существующих warnings** (React purity/hooks, включая недоступную в Django mock-суперадминку). Warnings не скрывались, правила не отключались.
- `test`: **81/81 PASS**: web 61, dialog 13, integrations 7.
- `eval`: **30/30 PASS**.
- `DATA_SOURCE=django pnpm build`: PASS, Next.js 16.4.5.
- Экспорт questionnaire с `--check` относительно соседнего backend: PASS.
- Chromium, `E2E_MODE=django`: **10/10 PASS**, 22.6 с, Python 3.12 + PostgreSQL 16.11. Backend API подключён как `allmanager_runtime`, отдельная роль без SUPERUSER/BYPASSRLS. Runtime секретов production нет.
- Backend на согласованном исходном коде: **42/42 PASS**, миграции 0001–0008, отсутствие новых миграций, OpenAPI validation. Подробности — backend `docs/PHASE_A_REPORT.md`.

Промежуточные прогоны не скрыты: новая проверка неизвестной цены сначала слишком узко требовала передачу администратору, хотя уточняющий вопрос тоже допустим; утверждение уточнено, запрет выдуманной цены сохранён. Несколько быстрых повторов всего набора исчерпали существующий лимит API 600 reads/min и получили 429; финальный прогон выполнен с новым процессом изолированного API, лимиты и MFA не отключались. Production build и dev следует запускать последовательно.

## GitHub Actions

| Workflow | Исходный main | Итоговая ветка |
| --- | --- | --- |
| Frontend CI | SUCCESS: https://github.com/ibrodevs/AI-Manager/actions/runs/42810039269 | SUCCESS (`61497f1`): https://github.com/ibrodevs/AI-Manager/actions/runs/42955333675 |
| Backend CI | FAILURE до старта PostgreSQL | SUCCESS (`39d79d7`): https://github.com/ibrodevs/AI-Manager-backend/actions/runs/42955088752 ; дополнительные Admin MFA/tenant тесты включены в ec7b01b |
| Frontend + Django | FAILURE: https://github.com/ibrodevs/AI-Manager/actions/runs/42810039224 | SUCCESS (`61497f1`): https://github.com/ibrodevs/AI-Manager/actions/runs/42955333671 |

Таблица фиксирует успешный прогон реализации. Последующее изменение закреплённого backend SHA добавляет только тесты Admin MFA/tenant и документацию. Актуальные проверки финальных веток: https://github.com/ibrodevs/AI-Manager/pull/1/checks и https://github.com/ibrodevs/AI-Manager-backend/pull/1/checks . Исходные security-проверки и legacy backend jobs сохранены. E2E не заменён mock-тестом.

## Воспроизведение

Сначала поднимите отдельный backend по его README. Для проверки RLS нужен PostgreSQL и отдельные migrator/runtime-роли. В frontend:

```sh
cp apps/web/.env.django.example apps/web/.env.local
npx pnpm@10.33.0 install --frozen-lockfile
DATA_SOURCE=django DEMO_ENVIRONMENT=0 ALLOW_MOCK_AUTH=0 npx pnpm@10.33.0 dev
# После готовности backend и frontend, в другом терминале:
E2E_MODE=django E2E_URL=http://localhost:3000 npx pnpm@10.33.0 --filter @all/web e2e
```

Нужен DEBUG seed_demo с PROVISION_PASSWORD=local-e2e-password-only в отдельной тестовой БД; для другого пароля задайте E2E_OWNER_PASSWORD. При повторном входе владельца передайте только тестовый E2E_TOTP_SECRET и дождитесь нового 30-секундного окна после использованного OTP. Фикстуры используют уникальные имена, исходные данные не удаляют.

## Остаток и этап B

- **NOT VERIFIED:** Docker images/Compose startup/shutdown/restart, Redis/Celery через брокер: Docker CLI здесь неработающая ссылка. Нативные тесты задач не подтверждают Docker-контур.
- **NOT VERIFIED:** production TLS, восстановление бэкапов, производительность, реальный voice transport, аудиохранилище и провайдеры. Они не заменены заглушками.
- Low: 27 существующих lint warnings; полный React-рефакторинг/редизайн не выполнялся.
- Универсальные read/commands сохраняют совместимый формат; OpenAPI не даёт точного типизированного описания каждого имени команды. Это ограничение перед внешним SDK, не утверждение о полной продуктовой приёмке.
- Django/CRM/tenant-модель подтверждены для тестируемого контура. Для B нужны шлюз подписанных событий с маршрутизацией tenant, секреты интеграции, storage/retention, наблюдаемость и отдельные голосовые/load-проверки. Реальные LiveKit/SIP, внешние сообщения, платные AI и новый биллинг не включались.
