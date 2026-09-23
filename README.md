# hack-78afec8c-se-g-ys
Hackathon team repository for SE G_YS

## Локальный запуск

QALA показывает исходные данные пяти районов и каталог 14 мероприятий, а затем позволяет собрать и проверить черновик сценария. Проверка не раскрывает Score.

Один раз установите зависимости:

```bash
uv sync --locked --project packages/draft-api
npm ci --prefix packages/draft-ui
```

```bash
npm start
```

Откройте `http://127.0.0.1:5173`. Скрипт запускает FastAPI на порту 8013 и Vite на порту 5173; Vite передаёт запросы `/api` в FastAPI.

Проверка:

```bash
npm test
uv run --project packages/draft-api pytest
npm test --prefix packages/draft-ui
```

Каталог доступен через `GET /api/catalog`, а проверка черновика — через `POST /api/drafts/validate`.

Принятие сценария выполняется через `POST /api/scenarios/accept` с JSON-полем `decisions` из пяти решений. Сервер возвращает причины отказа без результата для невалидного набора и детерминированный результат Q8 для принятого сценария.

После принятия браузер сохраняет неизменяемую попытку в `localStorage`. История доступна только в том же браузере: из неё можно открыть результат, создать редактируемую копию с тем же лимитом 100 или сравнить любые две попытки по решениям, расходам, Score и изменениям показателей районов.

## AI-разбор OpenAI

После принятия браузер сразу сохраняет расчётный результат и базовый разбор, затем асинхронно вызывает `POST /api/scenarios/analyze` с теми же решениями. Сервер пересчитывает результат, отправляет только рассчитанные факты в OpenAI Responses API со строгой JSON-схемой и проверяет каждый факт, обоснование и точечную замену перед показом AI-разбора. Ошибка сети, тайм-аут или некорректный ответ оставляют доступным явно обозначенный базовый разбор; кнопка «Повторить AI-разбор» не создаёт новую попытку.

Для живого вызова задайте серверные переменные окружения перед запуском:

```bash
export OPENAI_API_KEY='...'
export OPENAI_MODEL='gpt-4o-mini' # необязательно
export OPENAI_TIMEOUT_MS=12000    # необязательно
npm start
```

Ключ не передаётся браузеру и не сохраняется в localStorage. Без `OPENAI_API_KEY` приложение продолжает работать с базовым разбором.

The cached API at `POST /api/attempts/:attemptId/analysis` returns one verified AI version per attempt and locale (`ru` or `kk`), deduplicating concurrent requests and falling back to the localized basic analysis on failure.
