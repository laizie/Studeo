# CLAUDE.md — ClassTrack

Guidance for Claude Code working in this repo. Read this before making changes. See `PRD.md` for product spec and data model.

## Project summary
ClassTrack is a **local-first desktop app** (Windows + macOS) for students to track courses, assignments, recurring lecture times, tasks, and study sessions. Notion-like UI. Single-user, no login, no network sync in v1.

## Learning mode (important — this is a learning project)
Laiden is building ClassTrack to **learn** desktop/web development deeply — possibly as a career path — not only to ship something fast. Optimize for understanding, not just working code:
- **Explain before and after.** Before non-trivial work, briefly state what you'll do and why. After, summarize what each new piece does and how it fits the architecture.
- **Teach the concept, not just the keystrokes.** When introducing something new (the main/renderer split, IPC, React Query, SQL joins, the repository pattern, migrations), give a short plain-language explanation and *why* it's used here.
- **Favor clarity over cleverness.** Prefer readable, conventional code over terse or "smart" solutions, even if slightly longer.
- **Surface tradeoffs.** When a real decision comes up, name the alternatives so Laiden builds judgment.
- **Leave room to learn by doing.** Where a piece is a good exercise, offer to let Laiden write it first (with guidance) instead of generating all of it. Point to relevant official docs.
- **Check understanding.** Occasionally pause to confirm a concept landed before stacking the next one on top.

## Tech stack
- **Electron** (desktop shell) scaffolded with **Electron Forge** — Vite + TypeScript template.
- **React + TypeScript** for the renderer UI.
- **Tailwind CSS + shadcn/ui** (Radix primitives) for styling/components.
- **better-sqlite3** for the local database, used **only in the main process** (synchronous API).
- **TanStack Query (React Query)** in the renderer for data fetching/caching over IPC.
- **Zustand** for small ephemeral UI state (Pomodoro timer, active filters).
- **react-big-calendar** for calendar views.
- Use the current **Node.js LTS**. Pin dependency versions in `package.json`; prefer latest stable.

## Directory structure (target)
```
src/
  main/                 # Electron main process (Node). DB + IPC handlers live here.
    db/
      schema.sql        # table definitions (see PRD §7)
      migrations/       # ordered migration files
      connection.ts     # opens better-sqlite3, runs migrations
      repositories/     # courseRepo.ts, assignmentRepo.ts, taskRepo.ts, ...
    ipc/                # registerCourseHandlers.ts, etc. (validate input, call repos)
    main.ts             # app/window lifecycle, registers IPC handlers
  preload/
    preload.ts          # contextBridge: exposes a narrow, typed window.api
  renderer/             # React app (no Node access)
    app/                # routing, layout shell (sidebar + content)
    features/           # courses/, assignments/, tasks/, calendar/, study/, dashboard/
    components/ui/      # shadcn components
    lib/                # query hooks (useCourses, etc.), date utils, types
  shared/               # types + pure logic shared by main & renderer (NO electron imports)
    types.ts            # Course, Assignment, Task, ClassMeeting, Term, ...
    deadlines.ts        # computeDeadlineLabel(dueDate, now) etc.
```
Keep `shared/` free of Electron/Node-specific imports so the logic could be reused on other platforms later.

## Commands
- `npm start` — run in dev (HMR).
- `npm run package` — build an unpackaged app.
- `npm run make` — build distributable installers (`.dmg`, `.exe`).
- `npm run lint` / `npm run typecheck` — ESLint + `tsc --noEmit`.
- `npm test` — Vitest (logic in `shared/` and repositories).
Run `typecheck` and `lint` before considering any task done.

## Architecture rules (important)
- **Process boundary is sacred.** The renderer is untrusted UI. All DB, filesystem, and OS access happens in **main**, exposed through **preload** via `contextBridge`.
- **Security defaults (never weaken these):** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where feasible. The renderer must never import `better-sqlite3`, `fs`, or `electron` directly.
- **Typed IPC contract.** Define channel names and payload/response types in `shared/`. Preload exposes a single typed `window.api` object (e.g., `window.api.courses.list()`, `window.api.assignments.create(input)`). Validate all inputs inside main handlers before touching the DB.
- **Repository pattern.** SQL lives in `repositories/`. Handlers call repos; UI never sees raw SQL.
- **Data fetching.** Renderer uses React Query hooks (`lib/queries`) that call `window.api.*`. Mutations invalidate the relevant query keys so the UI refreshes.
- **Dates/times.** Store ISO/UTC; format to local only at display. Put relative-deadline logic in `shared/deadlines.ts` and unit-test it.
- **Derived values** (course progress, deadline labels) are computed, never stored.

## Styling conventions
- Tailwind utility classes; extract repeated patterns into components, not long class strings copy-pasted around.
- Use shadcn/ui components as the base; restyle via Tailwind to match Notion's calm aesthetic.
- **Course colors** come from a fixed token palette in one place (`lib/colors.ts`). Color is used as accent (border/dot/pill), never a full background flood.
- Light theme first; keep all colors as CSS variables / tokens so dark mode is a later flip.

## Coding conventions
- TypeScript `strict` on. No `any` without a written reason.
- Functional React components + hooks. One screen per `features/<name>/` folder.
- Name files by role: `courseRepo.ts`, `useCourses.ts`, `CourseCard.tsx`.
- Keep components small; push logic into `shared/` or hooks where testable.
- Prefer the existing pattern over introducing a new library. Ask before adding heavy deps.

## Domain rules
- **Assignment types** are a fixed enum defined once in `shared/types.ts`: `Assignment` (default catch-all) · `Homework` · `Quiz` · `Exam` · `Project` · `Lab` · `Reading` · `Paper`. Add or change types only there.
- **Fast entry is a product priority.** Support both a global **Quick Add** and a keyboard-driven **batch entry grid** ("Day-One Setup") for adding many assignments to a course at once. Keep both low-friction.
- **All business logic** (deadline computation, type/status lists, progress math, input validation) lives in `shared/` with **no Electron/Node imports**, so it stays reusable and unit-testable.

## How to add a new feature/screen (recipe)
1. Add/confirm types in `shared/types.ts`.
2. If new data: add a migration in `db/migrations/`, update `schema.sql`, add a repository.
3. Add IPC handlers in `main/ipc/` (validate inputs) and register them in `main.ts`.
4. Expose the methods through `preload.ts` on `window.api`.
5. Add React Query hooks in `renderer/lib/queries`.
6. Build the UI under `renderer/features/<name>/`, wire to hooks, add an empty state.
7. `typecheck`, `lint`, add tests for any new logic in `shared/`.

## Do NOT
- Do not access the database, filesystem, or `electron` from the renderer.
- Do not put secrets, tokens, or credentials in the renderer or in the repo.
- Do not disable `contextIsolation` or enable `nodeIntegration`.
- Do not bypass the repository/IPC layers with ad-hoc queries.
- Do not add cloud/sync/auth code in v1 — it's out of scope (see `PRD.md` §10).
- Do not deviate from the data model in `PRD.md` without flagging it.

## Working style for Claude Code
Work in small, reviewable steps following the milestone order in the project plan. After each change, run typecheck/lint. When something is ambiguous or would change the data model or architecture, stop and ask rather than guessing.
