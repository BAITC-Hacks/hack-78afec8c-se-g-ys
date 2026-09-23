# QALA draft editor — issues #2 and #3

Reusable React/TypeScript editor for adding, replacing, and removing decisions.
It uses the real [draft API](../draft-api/README.md) for all domain validation.
Russian is the default; Kazakh is available through the `locale` prop.

## Run the combined application

Requires Node.js 22.12+ (tested with Node 24), npm, and the Python package setup.
From the repository root, prepare both packages:

```sh
uv sync --locked --project packages/draft-api
npm ci --prefix packages/draft-ui
```

Start two terminals:

```sh
# Terminal 1, from packages/draft-api
uv run uvicorn examples.app:app --host 127.0.0.1 --port 8013

# Terminal 2, from packages/draft-ui
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` to port 8013. Stop each server
with Ctrl+C. The screen shows the issue #2 city baseline and catalogue, then mounts
the issue #3 editor against the same catalogue. From the repository root, `npm start`
starts both services together.

## Integrate with the teammate's app

Use this package as a local source dependency (React 19), or import its `src/index.ts`
from the host Vite project. `package.json` exports TypeScript source, so the host
must transpile it. Import the optional scoped CSS once.

```tsx
import { DraftEditor, createDraftValidator } from "@qala/draft-ui";
import "@qala/draft-ui/style.css";

const validate = createDraftValidator("/api/drafts/validate");

<DraftEditor
  catalog={draftCatalog}
  locale={locale}
  validate={validate}
  onChange={(decisions, validation) => setDraft({ decisions, validation })}
/>
```

Map the host's catalogue into `DraftCatalog` from `src/types.ts`:

- `budget`: organizer budget 100.
- `districts`: `{ id, name: { ru, kk } }[]`.
- `measures`: `{ id, direction, cost, scope, name: { ru, kk } }[]`.
- `scope`: `"district"` or `"city"`; IDs must match the server's catalogue.

The host owns catalogue loading and language selection. Keep catalogue contents
stable during an editing session; remount with a new React `key` when starting a
new draft or changing catalogues. Language changes do not require a remount.
The editor starts empty and keeps its last valid draft in memory. Refresh
persistence, accepted scenarios, history, and scoring belong to later issues.

`onChange` receives only successfully validated drafts, including incomplete or
budget-warning drafts. `validation.complete` is readiness, not acceptance.
The future acceptance flow must perform its own final server validation.

`validate` can be replaced with the host's HTTP adapter; it accepts the candidate
decisions and an `AbortSignal`. Errors preserve the previous draft and allow retry.
Controls are disabled while checking; unmount aborts the request and discards late
responses. Domain reasons are translated using stable API codes. The editor never
computes Score, scenario effects, incompatibilities, or the budget warning itself.

## Checks

From `packages/draft-ui`:

```sh
npm test -- tests/DraftEditor.test.tsx  # focused interaction checks
npm test                              # full UI suite
npm run typecheck
npm run build                         # typecheck and build the demo
```

Tests use Vitest, Testing Library, and a real FastAPI subprocess on a temporary
port. Run `uv sync --locked --project ../draft-api` first; no manually running server
is needed for tests. Network failures and delayed responses are controlled at the
HTTP boundary. Use two-space indentation and behavior-focused `*.test.tsx` names.

## Manual acceptance check

Add M3/Нура, M5/Сарыарка, and M13/Алматы. Confirm count 3, cost 83, remainder 17,
and a warning; edit or remove a choice to clear it. Switch to Kazakh and verify
that selections and numbers remain unchanged. Adding M1 alongside M3 must show
an error and preserve the previous draft. No draft state reveals Score.

The editor and validator are mounted in the local application against the shared
issue #2 catalogue.
