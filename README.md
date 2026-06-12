# Studeo

A local-first desktop app for students to track courses, assignments, recurring lectures, tasks, and study sessions. Notion-like UI. Single-user, no login, no cloud sync.

Built with Electron, React, TypeScript, and SQLite.

---

## Download

- **[Download for macOS](https://github.com/laizie/classtrack/releases/latest/download/Studeo-macOS.dmg)** — Apple Silicon
- **[Download for Windows](https://github.com/laizie/classtrack/releases/latest/download/StudeoSetup.exe)**

All versions are on the [Releases page](https://github.com/laizie/classtrack/releases).

> **Windows note:** the installer isn't code-signed, so SmartScreen may warn on first run — click **More info → Run anyway**.

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 42 (Electron Forge + Vite) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Node.js built-in SQLite (`node:sqlite`) — main process only |
| Data fetching | TanStack Query (React Query) over IPC |
| UI state | Zustand |
| Calendar | react-big-calendar |
| Music | Spotify Web API + Apple Music (AppleScript) |
| Tests | Vitest + @vitest/coverage-v8 |

---

## Getting started

**Prerequisites:** Node.js 22+, npm 10+

```bash
git clone https://github.com/laizie/classtrack.git
cd classtrack
npm install
npm start
```

`npm start` launches the app in development mode with hot-module replacement.

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Run in dev mode (HMR) |
| `npm run package` | Build an unpackaged app in `out/` |
| `npm run make` | Build distributable installers (`.dmg` on macOS, `.exe` on Windows) |
| `npm run typecheck` | Run `tsc --noEmit` — no type errors |
| `npm run lint` | Run ESLint |
| `npm test` | Run the full test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

---

## Architecture

The app follows Electron's two-process model strictly:

```
src/
  main/               # Electron main process — Node.js, DB, OS access
    db/
      connection.ts   # Opens SQLite, runs migrations on startup
      migrations/     # Ordered SQL migration files
      repositories/   # courseRepo, assignmentRepo, taskRepo, …
    ipc/              # IPC handlers — validate inputs, call repositories
    main.ts           # App lifecycle, window setup, registers handlers
  preload/
    preload.ts        # contextBridge — exposes typed window.api to renderer
  renderer/           # React app — no Node/Electron imports allowed
    app/              # Routing, sidebar, layout shell
    features/         # One folder per screen: courses, tasks, study, …
    lib/              # React Query hooks, date utils
    store/            # Zustand stores (timer, settings, study list)
  shared/             # Pure TypeScript — no Electron or Node imports
    types.ts          # Domain types, IPC channel names, window.api contract
    deadlines.ts      # Deadline computation logic (unit-tested)
    syllabusParser.ts # Syllabus text → assignment rows (unit-tested)
```

**Process boundary rules:**
- The renderer never imports `electron`, `node:sqlite`, or `fs`.
- All DB access goes through IPC: renderer → preload (`window.api`) → main → repository.
- `shared/` contains only pure TypeScript so it can be imported by both sides.

**Data flow for a mutation (e.g. creating an assignment):**
1. React component calls `window.api.assignments.create(input)`
2. Preload forwards via `ipcRenderer.invoke('assignments:create', input)`
3. Main process handler validates input and calls `createAssignment(input)`
4. Repository runs SQL against the SQLite DB
5. React Query invalidates the `assignments` query key → UI re-renders

---

## Database

The SQLite database lives outside the app bundle at:
- **macOS:** `~/Library/Application Support/Studeo/studeo.db`
- **Windows:** `%APPDATA%\Studeo\studeo.db`

This path survives app updates. On every startup, `connection.ts` runs any new migration files (already-applied ones are skipped via the `_migrations` table).

To add a schema change: create `src/main/db/migrations/002_your_change.sql`, import it in `connection.ts`, and append it to the `MIGRATIONS` array.

---

## Tests

Tests live next to source files in `__tests__/` directories. Run with `npm test`.

```
src/
  shared/__tests__/
    deadlines.test.ts       # Unit tests for deadline computation
    syllabusParser.test.ts  # Unit tests for syllabus text parsing
  main/db/__tests__/
    courseRepo.test.ts      # Integration tests (in-memory SQLite)
    assignmentRepo.test.ts
    taskRepo.test.ts
    classMeetingRepo.test.ts
    termRepo.test.ts
```

Repository tests use an in-memory SQLite database created fresh for each test — no mocking of SQL, no fixtures, full integration against the real schema.

Current coverage: **~99% statements, 100% functions, 100% lines** across `shared/` and `main/db/repositories/`.

---

## Building for distribution

**macOS** (run on a Mac):
```bash
npm run make
# Output: out/make/Studeo-*.dmg
```

**Windows** (run on Windows, or via CI):
```bash
npm run make
# Output: out/make/squirrel.windows/StudeoSetup.exe
```

**CI (GitHub Actions):** Push a version tag to build both platforms automatically:
```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow (`.github/workflows/build.yml`) runs macOS and Windows builds in parallel, then attaches the installers to a **draft GitHub Release** for that tag. Review the draft on the Releases page and click **Publish** to make the downloads public. Manual runs from the Actions tab only upload artifacts (no release).

---

## Spotify setup

Spotify integration requires a free Spotify Developer app:
1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Redirect URIs**, add exactly: `studeo://spotify-callback`
3. Copy the Client ID and paste it in Studeo's Settings → Music → Connect Spotify.
