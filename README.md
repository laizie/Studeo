<p align="center">
  <img src="Logos/colored-logo.png" alt="Studeo" width="220">
</p>

<p align="center">
  <b>A calm, local-first desktop app for tracking your classes.</b><br>
  Assignments, lectures, notes, and a focus area to actually get the work done.
</p>

<p align="center">
  Windows &amp; macOS · No account · No cloud · Your data stays on your machine.
</p>

---

## Download

- **[Download for macOS](https://github.com/laizie/Studeo/releases/latest/download/Studeo-macOS.dmg)** — Apple Silicon
- **[Download for Windows](https://github.com/laizie/Studeo/releases/latest/download/StudeoSetup.exe)**

Every version lives on the [Releases page](https://github.com/laizie/Studeo/releases).

> **Windows note:** the installer isn't code-signed yet, so SmartScreen may warn you on first
> run — click **More info → Run anyway**.

---

## What it does

**Set up a semester in a few minutes.** A first-run wizard walks you through your term, your
courses, and when each one meets. From there you can fill in the whole semester's work without
typing it all by hand:

- **Paste your syllabus** — drop in the text (or a PDF) and Studeo pulls out assignment names,
  types, and due dates for you to confirm.
- **Import from Canvas** — point it at your LMS calendar feed (`.ics`) and pull assignments in.
- **Repeat a row** — type "Homework 1" once and generate the weekly series through the end of term.

**See what's actually due.** The Dashboard answers "what's due soon, and what should I do right
now?" at a glance, with a semester timeline that shows where the busy weeks pile up. **This Week**
narrows it to the next seven days; the **Calendar** lays lectures and deadlines side by side.

**Add things in seconds.** Hit `⌘N` from anywhere and type naturally — `phys quiz 2 fri` becomes a
Physics Quiz named "Quiz 2" due Friday, parsed as you type. `⌘K` jumps to any screen, course,
assignment, or note.

**Focus Mode.** A full-screen study environment with a Pomodoro timer, a focus list you build from
your real assignments, ambient sound (rain, beach, wind, brown noise — synthesized live, so it
works offline), and playback control for Spotify or Apple Music. Checking an item off in here marks
it done everywhere else in the app.

**Notes that belong to a class.** A block editor (headings, lists, code, images, slash commands)
with a notebook per course, notes linked to lectures and assignments, and version history.

**Know where you stand.** Record scores as they come back, define your own grade sections and
weights, and ask "what do I need on the final?" — Studeo computes the answer.

**Nudges, not nagging.** Optional reminders before class and a daily digest of what's due. A
**Weekly Review** on Sunday shows what you finished, how your focus time compared to last week, and
what rolls over.

**Exam coming up?** Back-planning turns "exam on the 14th" into suggested study blocks spread
across the days before it.

---

## Your data stays yours

Studeo has no account, no server, and no sync. Everything lives in a single SQLite file on your
computer:

- **macOS:** `~/Library/Application Support/Studeo/studeo.db`
- **Windows:** `%APPDATA%\Studeo\studeo.db`

That file survives app updates. **Settings → Data** will back it up (notes and images included) or
restore it from a previous backup. Nothing leaves your machine unless you connect Spotify, which
talks only to Spotify.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘N` / `Ctrl+N` | Quick Add — an assignment or task, from any screen |
| `⌘K` / `Ctrl+K` | Command palette — jump to any screen, course, assignment, or note |
| `⌘Z` / `Ctrl+Z` | Undo the last change |
| `⌘↵` / `Ctrl+↵` | Save and keep going, without leaving the keyboard |

---

## Connecting Spotify (optional)

Spotify playback control needs a free Spotify Developer app — it takes about a minute:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Redirect URIs**, add exactly: `studeo://spotify-callback`
3. Copy the Client ID into **Settings → Music → Connect Spotify**.

Apple Music works on macOS with no setup.

---

## How it's built

| Layer | Technology |
|---|---|
| Desktop shell | Electron 42 (Electron Forge + Vite) |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Node.js built-in SQLite (`node:sqlite`) — main process only |
| Data fetching | TanStack Query over typed IPC |
| UI state | Zustand |
| Calendar | react-big-calendar |
| Notes | BlockNote |
| Tests | Vitest — 399 tests |

The app follows Electron's two-process model strictly. The renderer is treated as untrusted UI:
it never imports `electron`, `node:sqlite`, or `fs`. All database and OS access happens in the
main process and is exposed through a narrow, typed `window.api` via `contextBridge`.

```
src/
  main/          # Node. SQLite, migrations, repositories, IPC handlers.
  preload/       # contextBridge — the only door between the two sides.
  renderer/      # React. One folder per screen. No Node access.
  shared/        # Pure TypeScript — types + logic used by both sides.
```

Creating an assignment, end to end: a component calls `window.api.assignments.create(input)` →
preload forwards it over IPC → the main-process handler validates the input → a repository runs the
SQL → React Query invalidates the `assignments` key and the UI re-renders.

Business logic (deadline math, syllabus parsing, grade computation, study planning) lives in
`shared/` with no Electron or Node imports, which keeps it portable and unit-testable.

---

## Running it locally

**Prerequisites:** Node.js 22+, npm 10+

```bash
git clone https://github.com/laizie/Studeo.git
cd Studeo
npm install
npm start
```

| Command | What it does |
|---|---|
| `npm start` | Run in dev mode with hot-module replacement |
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run make` | Build installers (`.dmg` on macOS, `.exe` on Windows) |

---

## License

MIT © Laiden Ziegler
