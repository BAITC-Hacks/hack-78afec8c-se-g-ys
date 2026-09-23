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
