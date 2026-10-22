# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Onyx Log is a single-user tracker for one KTM Duke 250 Gen 3: fuel economy, a maintenance log with receipt uploads, an interval-based maintenance planner, and a static specs sheet. Units are km and currency is INR. Plain JavaScript (ESM) throughout, no TypeScript.

## Commands

```bash
npm run install-all            # root + server + client deps
npm run dev                    # nodemon API on :5000 + Vite on :5173 (proxies /api and /uploads to :5000)
npm run build && npm start     # production mode: Express serves the API and client/dist on :5000

cd server && npm test          # runs every test script in sequence
cd server && node test_planner.js   # run a single test file (each is a standalone node script using assert)
cd client && npm run lint      # oxlint
```

Deploy is `fly deploy` (two-stage Dockerfile, Fly volume mounted at `/data`). Env vars: `PORT` (5000), `DATA_DIR` (database.db, backups/, uploads/; defaults to `server/`, `/data` on Fly), `ACCESS_PASSWORD` (falls back to `onyx250` with a warning).

During `npm run dev` use :5173. If a stale `client/dist` exists, :5000 serves that old build. `server/database.db` is real personal data.

## Architecture

React SPA → JSON REST (`server/server.js`, every route in one file) → SQLite via `server/db.js` (promise wrappers `dbRun`/`dbGet`/`dbAll` over the native `sqlite3` driver) plus receipt files in `DATA_DIR/uploads`.

**Startup order matters.** `db.js` opens the database when it is imported, runs `initializeDatabase()` (schema plus migrations), and resolves the exported `dbReady`. `server.js` registers routes, then waits for `dbReady`, loads `session_secret` into memory, starts `scheduleBackups()`, and only then calls `listen`.

**Migrations** have no framework. They are idempotent steps inside `initializeDatabase()` that run on every boot, including against the live Fly database: `PRAGMA table_info` checks before `ALTER TABLE`. Factory planner tasks are reconciled **by task name** through `FACTORY_TASKS`, `FACTORY_TASK_UPGRADES` and `ADDED_FACTORY_TASKS`. Factory rows have `is_custom = 0` and cannot be deleted through the API.

**Derived data is computed on read by pure modules, never stored:**
- `fuelEconomy.js` produces per-entry km/L and the overall average. Tier 1 uses full-to-full segments, with partial-fill litres carried into the next full fill. Tier 2 falls back to a span estimate flagged `isEstimated`. Used by both `/api/fuel` and `/api/dashboard`.
- `planner.js` (`computePlannerTasks(tasks, currentOdo, now)`) produces due km/days, the Overdue / Due Soon / Unconfigured / Upcoming status, `consumedPercent` and sort order. `now` is injected so tests can pin the date.

Keep new business logic in modules like these, with tests, rather than inline in route handlers.

**Odometer invariant** (`odometer.js`): `bike_status.current_odometer` is a cache of MAX(`manual_odometer`, max fuel-log odometer, max maintenance-log odometer). Never write `current_odometer` directly. Change a source, then call `refreshOdometer()`. Validate every odometer input with `isValidOdometer` (whole km, ≥ 0). `bike_status` is a single row (`CHECK (id = 1)`) that also holds the auth `session_secret`.

**Auth**: one shared password. Login returns a stateless token `<expiry>.<HMAC-SHA256(session_secret, expiry)>` valid for 30 days. Every `/api` route except `POST /api/auth/login` uses `requireAuth` (Bearer header). `/uploads` also accepts `?token=` because `<img>`/`<iframe>` can't send headers; the client builds those URLs with `uploadUrl()`.

**Backups** (`backup.js`): a daily `VACUUM INTO` snapshot to `DATA_DIR/backups/database-<UTC>.db`, keeping the newest 7. It is checked at startup and then hourly, because Fly auto-stops idle machines.

**Client**: `App.jsx` owns all state and fetches `/api/dashboard`, `/api/fuel`, `/api/maintenance` and `/api/planner` in parallel. Components receive data as props and call `refresh` after any write, which re-fetches all four. Tabs are local state; there is no router.
- Always call the API through `apiFetch` (`api.js`). It attaches the token and, on a 401, clears it and fires `UNAUTHORIZED_EVENT`, which sends `App` back to the login screen. The only exception is `Login.jsx`, which uses raw `fetch`.
- Receipt flow: `POST /api/upload` first, then save the log with `billPath`. Closing the dialog without saving deletes the uploaded file.
- Styling: design tokens and classes live in `client/src/index.css`, but components use many inline styles. Inline styles can't be overridden by media queries, so anything that must change at mobile widths needs a class. Responsive rules are in the `max-width: 768px` block.

API responses return snake_case database columns mixed with camelCase computed fields (`dueInKm`, `isEstimated`). Request bodies are camelCase.

## Tests

Server only; there are no client tests and no CI. Tests that touch the database set `process.env.DATA_DIR` to a temp directory *before* dynamically importing `db.js` (it reads `DATA_DIR` on import). Follow that pattern so tests never touch `server/database.db`. Add new test files to the `test` script in `server/package.json`.
