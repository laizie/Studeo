# Studeo — Codebase Audit

Read-only pass over the whole repo (config, main process, preload, DB layer, IPC,
renderer, styling, CI). Nothing was modified. `npm run typecheck` is clean,
`npm test` is green (29 files / 423 tests), `npm run lint` reports 0 errors and
83 warnings (all `no-non-null-assertion`, mostly in tests).

**Overall:** this is a well-built codebase — genuinely better than most hobby
Electron apps. The process boundary is respected, the preload bridge is narrow
and typed, IPC handlers validate their inputs, SQL is parameterized everywhere,
the pure logic in `shared/` is tested, and the comments explain *why* rather than
*what*. Most of what follows is the stuff that only shows up when you go looking:
lifecycle bugs, config drift, and a handful of places where a silent failure was
chosen over a loud one.

A note on how to read this: each item names the concept behind the problem, not
just the fix. Where I'm not certain something is a bug, I say so and tell you
what to check.

---

## Critical

> **Status: all three fixed** (2026-07-25). Findings kept in full below — the reasoning
> is the point, not just the diff. Each fix is its own commit. See "Verification" at the
> foot of this section for what was actually exercised.

### C1. ✅ FIXED — Migrations run outside a transaction — a failure permanently bricks the database
**`src/main/db/connection.ts:129–134`**

```
for (const { name, sql } of MIGRATIONS) {
  if (ran.has(name)) continue;
  database.exec(sql);                                    // ← not in a transaction
  database.prepare('INSERT INTO _migrations …').run(name);
}
```

**What's wrong.** `database.exec(sql)` runs a multi-statement migration file
statement-by-statement with autocommit on. If statement 3 of 5 throws, statements
1–2 are already committed, and the `INSERT INTO _migrations` never runs. On the
next launch the runner sees the migration as un-applied and replays it from the
top — where statement 1 now fails with `table already exists` or
`duplicate column name`. `initDb()` throws inside `app.on('ready')`, and the app
never opens again. There is no rollback path and no way for a student to recover
without deleting their database.

**Why it matters.** This is the one failure mode in the app that destroys data
permanently and cannot be undone from inside the app. It's also silent until it
happens. Note that migrations 004, 007, 009, 010, 011, 013, 014 are `ALTER TABLE
ADD COLUMN` statements with no `IF NOT EXISTS` — they are exactly the ones that
can't be safely replayed.

**Concept.** A migration is only "applied" if the schema change *and* the bookkeeping
row land together. That's an atomicity requirement, which is what transactions are for.

**Sketch of the fix.** Wrap each migration in `BEGIN` / `COMMIT` / `ROLLBACK`,
with the `_migrations` insert inside the same transaction, so a migration either
fully applies and is recorded, or leaves the database exactly as it was. (SQLite
supports transactional DDL, so this genuinely works here — it wouldn't in MySQL.)
While you're there, consider taking an automatic `VACUUM INTO` snapshot before
running any pending migration, so an upgrade is recoverable even if the SQL is
correct but the *data* transformation is wrong.

---

### C2. ✅ FIXED — No Content-Security-Policy, and no navigation or window-open guards
**`src/main.ts:68–93`, `index.html`**

**What's wrong.** Three of Electron's four standard renderer hardening steps are
in place (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` —
all correct and well-commented). The fourth is missing entirely: there is no CSP,
no `meta http-equiv="Content-Security-Policy"` in `index.html`, no
`session.defaultSession.webRequest.onHeadersReceived` injecting one, no
`webContents.setWindowOpenHandler`, and no `will-navigate` handler.

**Why it matters.** Content in this app comes from outside it: `.ics` feeds fetched
over the network, text extracted from arbitrary PDFs, note documents, Spotify and
Apple Music metadata, and note images served over the custom `studeo-asset://`
scheme (registered as `standard` + `secure`, so it's a first-class origin). None
of that is *currently* rendered as HTML — the audit found zero uses of
`dangerouslySetInnerHTML` — so this is defense in depth, not a live hole. But
without a CSP:
- any future XSS becomes fully exploitable rather than contained;
- a stray `<a href="https://…">` or `window.open` in the note editor can navigate
  the *main window* away from your app, and the user has no way back (no address bar);
- there's nothing stopping the renderer from loading remote scripts or beaconing
  out, which quietly breaks the "local-first, no network" promise in PRD §2.

**Sketch of the fix.** Add a CSP that reflects what the app actually needs —
roughly `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`
(BlockNote/Mantine inject inline styles); `img-src 'self' studeo-asset: data:
https:` (Apple Music artwork arrives as a `data:` URL and Spotify artwork as an
https URL); `font-src 'self'`; `connect-src 'self'`. Set it in `onHeadersReceived`
for the packaged `file://` load, and add `setWindowOpenHandler` returning
`{ action: 'deny' }` plus a `will-navigate` guard that calls
`shell.openExternal` for anything that isn't your own origin.

*Expect this one to take iteration* — dev mode (Vite HMR needs `'unsafe-inline'`
and a websocket connection) and production need different policies. It's the
highest-value security item but not the lowest-risk one; see "Where I'd start".

---

### C3. ✅ FIXED — The timer's crash-recovery path can log the same focus session on every relaunch
**`src/renderer/store/useTimerStore.ts:325–360` (the `restored` IIFE) and `:510–521` (the `subscribe`)**

**What's wrong.** At module load, if the persisted snapshot says a focus block was
running and its `endsAt` is now in the past, the code writes a `StudySession`
straight through IPC (line ~338). It never clears or rewrites the snapshot. The
`localStorage` write-back is a `useTimerStore.subscribe(…)` registered *after* the
store is created (line 510), and Zustand's `subscribe` only fires on subsequent
`set()` calls — so the stale `{ isRunning: true, endsAt: <past> }` snapshot survives
untouched unless the user actually touches the timer.

**Failure scenario.** Start a focus block → quit the app mid-block → relaunch (a
session is logged, correctly) → never touch the timer → quit → relaunch. A second
identical session is logged. And a third. Every launch adds a phantom focus block
to the study history, inflating the heatmap, the "focused this week" line on the
Dashboard, and the Weekly Review — with no UI anywhere to delete a study session
(see M9).

**Concept.** A recovery routine that consumes a piece of persisted state must
*retire* that state as part of consuming it, or the recovery isn't idempotent.

**Sketch of the fix.** Clear (or immediately overwrite) `studeo:timerState` inside
the same branch that logs the session, before the async `create` resolves.

**Fix applied.** `writeSnapshot(restored)` runs immediately after the restore branch,
overwriting the consumed snapshot with what was actually restored. That makes recovery
idempotent regardless of the open question below. Modelled before/after: four launches
with an unfinished block logged **4** sessions before, **1** after.

**⚠️ Still worth verifying.** This whole feature rides on `localStorage` surviving a quit,
and `src/main/settings.ts:7–10` documents the opposite belief — it says Chromium
"does not reliably persist localStorage for `file://` origins across a full
quit/relaunch," which is why every *preference* was moved into a main-process JSON
file. If that's true in your packaged build, then this bug can't fire — but the
"resume your running session after a relaunch" feature is also dead code. Either
way something is wrong; find out which by packaging a build (`npm run package`),
starting a timer, quitting, and relaunching. If localStorage doesn't survive, move
the timer snapshot to the same main-process settings file as everything else.

---

### Verification of the Critical fixes

Not "it compiles" — what was actually exercised:

**C1** — replayed the failure against a real SQLite database using the new runner shape:
a migration whose first `ALTER TABLE` succeeds and whose second fails. Confirmed the
half-applied column is rolled back, `_migrations` stays clean, user rows are untouched,
a second launch fails *identically* (not with a confusing "duplicate column"), and once
the SQL is corrected it applies cleanly. The failure is now recoverable instead of terminal.

**C2** — built and launched the **packaged** app (`file://` origin, the case that couldn't
be tested in dev) and drove it over the remote debugging port:
- `script-src 'self'` **does** resolve under `file://` — this was the open risk, and it
  holds. React mounted, 18 fonts loaded, DM Sans applied, `window.api` present.
- An inline script injected as a probe was **blocked**, proving the policy is enforced
  rather than merely present.
- All 10 routes render real content; the lazy BlockNote chunk loads and injects its
  stylesheet (so `style-src 'unsafe-inline'` is doing its job).
- `media-src`: both bundled ambience tracks (`beach`, `rain`) load over `file://`.
- Guards: `window.open()` returns `null`; a `file:///etc/passwd` navigation is refused
  and the window stays on the app page; HashRouter navigation still works.
- **Zero** CSP violations and zero console errors across the whole tour.
- Dev mode (`npm start`) separately verified clean: Vite HMR websocket connects, no violations.

**C3** — modelled the launch sequence with a stale snapshot (see above).

*Not covered:* the note editor was mounted via a non-existent id to force its chunk to
load, but no note was opened or created, and Spotify/Apple Music artwork (`img-src data:`
and `https:`) was reasoned from the code rather than exercised — both need real
credentials and real data. If album art or a note image ever fails to appear, the console
will now say so explicitly, which is the point.

---

## High

> **Status: all twelve fixed** (2026-07-25), in five commits. Findings kept in full —
> the reasoning is the point. One scope correction is recorded under H9.

### H1. ✅ FIXED — The auto-updater points at a repository that isn't yours
**`src/main/updater.ts:33`** — `repo: 'laizie/classtrack'`; `git remote -v` says `laizie/Studeo`.

**Confirmed live.** The packaged build launched during the C2 verification printed:
`feedURL https://update.electronjs.org/laizie/classtrack/darwin-arm64/1.3.2` → `update-not-available`.

`update-electron-app` asks `update.electronjs.org/laizie/classtrack/…` for a newer
release. That repo isn't the one your GitHub Actions workflow publishes to, so
installed copies will never see an update — silently, forever, and only in packaged
builds (the function early-returns when `!app.isPackaged`, so you can't hit it in
dev). "ClassTrack" is the old working title from `PRD.md`; the rename didn't reach
this line. One-word fix; test by publishing a release and watching a packaged build's
console.

### H2. ✅ FIXED — `canvasFeedUrl` isn't in the settings allowlist, so "remember my feed URL" silently does nothing
**`src/renderer/features/import/ImportFeedPage.tsx:13, 160` vs `src/main/ipc/registerAppHandlers.ts:11–27`**

The import page calls `window.api.app.setSetting('canvasFeedUrl', trimmed)`. The
handler's `SETTING_KEYS` allowlist doesn't contain that key, and the handler is
written to *ignore* unknown keys rather than throw ("a bad call just doesn't persist
anything"). So the write is dropped without a trace and the URL field is empty on
every visit.

The allowlist itself is correct and good practice — untrusted input should never
name an arbitrary storage key. The problem is the *silent* drop: it turns a code
bug into an invisible product bug. Add the key, and make the handler
`console.warn` (or throw in dev) on an unknown key so the next drift announces itself.

### H3. ✅ FIXED — The Dashboard's idea of "today" freezes at mount
**`src/renderer/features/dashboard/DashboardPage.tsx:373–379`**

```
const todayMidnight = useMemo(() => { … }, []);   // empty deps
const weekEnd       = useMemo(() => getWeekEnd(), []);
const todayDow      = new Date().getDay();        // recomputed, but nothing triggers a render
```

`Overdue`, `Due this week`, `Today's classes`, the greeting, and every
`computeDeadlineLabel()` badge are all derived from the date captured when the
component mounted. This is a desktop app students leave open — cross midnight and
the Dashboard keeps showing yesterday: an assignment due today still reads
"Tomorrow", nothing new moves into Overdue, and "Today's classes" lists the wrong
day. The same pattern is in `ThisWeekPage` and `TasksPage`.

**Concept.** `new Date()` inside a render is not reactive. Anything that should
change when wall-clock time crosses a boundary needs a signal that fires at that
boundary.

**Fix sketch.** A tiny `useToday()` hook that holds today's local day-key in state
and schedules a single `setTimeout` to the next local midnight (rescheduling itself
each time), shared by all three pages. Cheap, and it also makes the pages testable.

### H4. ✅ FIXED — Courses with no semester disappear when a term auto-selects
**`src/renderer/lib/useTermFilter.ts:20–27`; `DashboardPage.tsx:361–364`; `CoursesPage.tsx:18–21`**

`useTermFilter` auto-picks the term whose date range contains today. Both pages
then filter with `termFilter === null || c.term_id === termFilter`, which drops
every course whose `term_id` is `NULL`. `CourseDialog` makes Semester optional and
defaults it to "— No semester —" (`CourseDialog.tsx:50, 240–258`).

**Failure scenario.** A student who has set up one semester adds a course from the
Dashboard, leaves Semester untouched, saves — and the course is nowhere. Worse, if
it was their only course, `CoursesPage` renders the **empty state**: "No courses
yet." That reads as data loss.

**Fix sketch.** Either always include un-termed courses in a term view (they're
"unfiled", not "belonging to a different term"), or default new courses to the
currently-selected term, or surface a count — "3 courses hidden by this filter".
The first is the smallest and safest.

### H5. ✅ FIXED — Dialog focus effects re-run on every parent render, stealing focus and breaking focus restore
**`src/renderer/components/ConfirmDialog.tsx:30–48`; `src/renderer/components/DialogShell.tsx:28–52`**

Both effects list `[isOpen, onClose]`. Every call site passes an inline arrow —
e.g. `onClose={() => setConfirmOpen(false)}` in `AssignmentRow.tsx:255` — which is
a new function identity on every render of the parent. So the effect tears down and
re-runs whenever the parent re-renders for *any* reason (a React Query refetch, a
mutation settling, a Zustand update).

Two consequences, both real:
1. **Focus is yanked back.** `ConfirmDialog` calls `cancelRef.current?.focus()` on
   every run. Tab to "Delete", let a background refetch land, and you're on
   "Cancel" again. `DialogShell` restarts its 50 ms auto-focus timer, which can
   pull focus off a field the user just clicked into.
2. **Focus restore breaks.** `previousFocus.current = document.activeElement` is
   reassigned on each run — after the first run that's the *Cancel button inside
   the dialog*. On close, the cleanup focuses an unmounted node and focus falls to
   `<body>`. Keyboard users lose their place entirely.

**Concept.** Effect dependency arrays are identity comparisons. An unmemoized
callback prop is a dependency that changes every render, which turns "run once
while open" into "run constantly."

**Fix sketch.** Split the effects: one `[isOpen]`-only effect owns initial focus
and restore; a separate effect owns the Escape listener and can safely depend on
`onClose`. Keep the `previousFocus` capture in the `[isOpen]` effect. (Memoizing
`onClose` at every call site also works but is the more fragile discipline.)

### H6. ✅ FIXED — `applyDueFilter` parses due dates as UTC, causing an off-by-one day
**`src/renderer/features/courses/CourseDetailPage.tsx:42–47`**

```
const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + parseInt(filter));  // local
return assignments.filter(a => new Date(a.due_date) <= cutoff);                  // UTC!
```

`new Date('2026-07-25')` is parsed as **UTC midnight**. In any negative-offset zone
(all of the US) that's 8pm the previous day *local*, so items on the boundary day
fall on the wrong side of the filter. This is precisely the bug that
`shared/deadlines.ts:17–23` exists to prevent — `parseDateLocal()` is documented
there with this exact explanation, and it's used correctly everywhere else in the
renderer. This is the one site that missed it.

**Fix sketch.** `parseDateLocal(a.due_date) <= cutoff`. Worth a unit test in
`shared/` pinning the boundary behavior.

### H7. ✅ FIXED — Focus Mode's Escape handler captures a stale `leave()`
**`src/renderer/features/study/FocusMode.tsx:787–801` and `:805–820`**

The keydown effect's deps are `[isOpen, isRunning, pickerOpen, pause, start, reset, skip]`
— `leave` is not among them, and `leave` closes over `isFullscreen`, which is
updated by an independent listener (`:763–769`) driven from the main process.

**Failure scenario.** Enter Focus Mode → the app goes OS-fullscreen → press Escape.
The handler runs the `leave` captured when the effect last ran, whose `isFullscreen`
was `false`, so `window.api.app.setFullscreen(false)` is skipped. Focus Mode closes
but the window stays fullscreen — the app is left in a state the user didn't ask for.

The comment two lines above shows the author already reasoned about staleness here
(reading the parking-lot store via `getState()` "whose closure can be a render or
two stale") — the same reasoning just wasn't extended to `isFullscreen`.

**Fix sketch.** Read the fullscreen state via a ref, or add `leave` to the deps and
wrap it in `useCallback`. Structurally, this is the bug that H8 would have caught
automatically.

### H8. ✅ FIXED — `eslint-plugin-react-hooks` is not installed, and CI never runs lint
**`.eslintrc.json`; `package.json`; `.github/workflows/ci.yml`**

There is no React ESLint plugin in the config or in `devDependencies`. In a 17,500-line
React renderer, `react-hooks/exhaustive-deps` and `react-hooks/rules-of-hooks` have
never run. H5, H7, and several Medium items below are exactly what that rule catches.
Separately, `ci.yml` runs `typecheck` and `test:coverage` but **not** `lint`, so even
the rules you do have are advisory.

**Fix sketch.** Add `eslint-plugin-react` + `eslint-plugin-react-hooks`, turn
`exhaustive-deps` on as a *warning* first (it will light up), work the list down,
then promote to error and add `npm run lint` to CI. This is the single highest
leverage change in this document.

### H9. ✅ FIXED (scope corrected) — `mutateAsync` calls with no rejection handling
**`src/renderer/features/quickadd/QuickAddDialog.tsx:145–177` and `:97–108`**

`handleSubmit` awaits `createAssignment.mutateAsync(…)` / `createTask.mutateAsync(…)` /
`createNote.mutateAsync(…)` with no `try`/`catch`. `mutateAsync` — unlike `mutate` —
*rethrows*, so a failed save produces an unhandled promise rejection. React Query's
`MutationCache.onError` still fires (so the user sees a toast) and `isError` renders
inline, so the user isn't left in the dark — but the rejection is genuinely unhandled,
which pollutes the console, can trip `unhandledrejection` reporting, and means the
lines after the `await` (`showUndoToast`, `resetForNext`/`onClose`) silently never run.
`captureLecture` has the same shape around `createLectureNote`.

**Fix sketch.** Wrap in `try`/`catch` and let the existing `isError` UI carry it — or
switch to `mutate` with an `onSuccess` callback, which is what the rest of the app does.

**⚠️ Scope correction (found while fixing).** Eleven other files use `mutateAsync`
without a catch — `AddAssignmentDialog`, `CourseDialog`, `AddTaskDialog`,
`ClassMeetingDialog`, `MeetingExceptionDialog`, `PlanStudyDialog`, `SubtaskChecklist`,
`EntityNotesList`, `ClassNotebookPage`, `MeetingsStep`, `SetupWizardPage`. I checked
each: at those sites the code after the `await` is only `onClose()` / `navigate()`, so
skipping it on failure is the **desired** behaviour — the dialog stays open holding the
user's input, and the global toast reports the error. The only residue there is the
unhandled rejection itself (console noise; invisible in a packaged build).

So the High rating applied to QuickAddDialog specifically, where a confirmation toast,
an Undo registration, and the form reset were all being skipped. That one is fixed.
The remaining eleven are a **Low** consistency cleanup, not a behaviour bug — deliberately
not bundled into this batch rather than silently expanding it into an 11-file refactor.

### H10. ✅ FIXED — No React error boundary anywhere
**`src/renderer.tsx`, `src/renderer/app/App.tsx`**

A single throw during render — a malformed date, an unexpected `null` from a
`row as Course` cast (L4), a bad BlockNote document — unmounts the entire React tree
and leaves a blank window. There's no in-app recovery; the user's only route back is
View → Reload from Electron's default menu, which most students won't find, or
force-quitting.

**Fix sketch.** One error boundary around `<Outlet />` in `Layout`, rendering a
"Something went wrong on this screen" panel with a "Go to Dashboard" button, plus one
at the root as a backstop. You already have `QueryErrorState` as the visual template.

### H11. ✅ FIXED — Deleting a course leaves dangling note links for its assignments and lectures
**`src/main/db/repositories/courseRepo.ts:113–124`; `src/main/db/repositories/noteLinkRepo.ts:112–116`**

`deleteCourse` removes only `entity_type = 'course'` links. The DB cascade then deletes
the course's assignments and class meetings — but `note_links` rows with
`entity_type = 'assignment'` or `'class_meeting'` pointing at those now-deleted ids
survive, because `entity_id` deliberately has no foreign key (it's polymorphic).
The individual `deleteAssignment` / `deleteClassMeeting` IPC handlers *do* call
`deleteLinksForEntity` — the cascade path bypasses them.

`005_notes.sql`/`006_note_links.sql`'s own comment states the invariant ("links are
cleaned up when their entity is deleted"), so this is a broken invariant, not a design
choice. Symptom: a note's link bar shows a link to something that no longer exists, and
the rows accumulate silently.

**Fix sketch.** Inside `deleteCourse`'s existing transaction, delete links for the
course's assignment ids and meeting ids too (a subselect over the ids you already snapshot).
`restoreCourse` currently gets away with this by chance — the links were never removed, so
they re-resolve — so you'll want to snapshot and restore them once you start deleting them.

### H12. ✅ FIXED — Assignment `type` / `status` and course `color` are never validated
**`src/main/ipc/registerAssignmentHandlers.ts:43–69`; `registerCourseHandlers.ts:18–23`; `registerTaskHandlers.ts`**

The handlers check presence (`!input.courseId`, `!input.name?.trim()`) and validate
grades and `dueTime` carefully — but `type` and `status` are written straight to SQL with
no membership check against `ASSIGNMENT_TYPES` / the status enum, and there are no CHECK
constraints on those columns either (M2). `color` is only checked for truthiness.

The renderer only ever sends valid values today, so nothing is broken right now. But
`CLAUDE.md` states the rule — "Validate all inputs inside main handlers before touching
the DB" — and the trust boundary is the point: main must not assume the renderer is
well-behaved. The realistic path to a bad row isn't an attacker, it's the ICS importer,
the syllabus parser, or a future migration.

**Fix sketch.** A shared `assertOneOf(value, ALLOWED, label)` helper in `shared/`, used by
the handlers; and CHECK constraints in a new migration as the backstop (see M2).

---

### Verification of the High fixes

Re-packaged the app and drove it over the remote debugging port again:

- **Regression check** — all 9 routes still render real content under the CSP, with zero
  violations and zero console errors. (The High batch touched Layout, the renderer entry,
  and three pages, so this needed re-proving.)
- **H10** — forced a real render throw inside a page (made `Date.prototype.toLocaleDateString`
  throw, which page code calls during render and React internals never touch). The boundary
  caught it, showed the message, **the sidebar survived**, the window was not blank, and
  navigating away reset it and fully recovered.
  *First attempt was a bad test:* sabotaging `Array.prototype.filter` broke React's own
  internals so the boundary couldn't render its own fallback — that measured the test, not
  the code.
- **H3** — shifted only what the page perceives as the current time forward by two days and
  fired the wake path. The Dashboard moved from "Saturday, July 25" to "Monday, July 27" and
  back on restore, so the view is genuinely reactive to the day rather than frozen at mount.
- **H4** — Courses page renders both courses with the semester filter active.
- **H11 / H12** — covered by tests instead: the new courseRepo cases fail without the fix
  (snapshot captured 1 link where 3 were destroyed), and `validate.test.ts` pins the enum
  and hex-colour rules.
- **H1** — the wrong feed URL was observed live before the fix; the corrected slug can only
  be confirmed by publishing a release, so that one is still unproven in the field.

`typecheck` clean · `lint` 0 errors / 85 warnings · 437 tests passing.

---

## Medium

> **Status: 14 of 15 fixed** (2026-07-26), in six commits. M14 is deliberately left
> alone — see its entry for the reasoning. M13 is fixed at the layer that mattered
> most; the remaining half is a dependency decision flagged for you.

### M1. ✅ FIXED — Missing indexes on the columns every list query filters and sorts by
**`src/main/db/migrations/001_initial.sql`**

The only indexes in the schema are on `subtasks`, `notes`, `note_links`,
`note_versions`, and `study_blocks(assignment_id)` — all added in later migrations.
The original tables have none beyond their primary keys. Unindexed:
`assignments(course_id)` (filtered on every Course Detail load and in
`deleteCourse`'s snapshot), `assignments(due_date)` (the `ORDER BY` on every list),
`class_meetings(course_id)`, `tasks(due_date)`, `study_sessions(started_at)` and
`(course_id)`.

At a student's data volumes (hundreds of rows) SQLite scans these in microseconds,
so this is not currently a performance problem — it's a correctness-of-design point
that gets expensive if the app ever grows history. Also worth noting: an unindexed
`REFERENCES` column makes cascade deletes O(n) per parent row. Add them in a
migration; `CREATE INDEX IF NOT EXISTS` makes it safely re-runnable.

### M2. ✅ FIXED (partly, by design) — No CHECK constraints on status/type columns
**`001_initial.sql`** — `class_meetings.day_of_week`, `meeting_exceptions.kind`,
`subtasks.completed`, and `study_blocks.status` all have CHECK constraints. But
`assignments.status`, `assignments.type`, and `tasks.status` — the three enums the
UI branches on most — have none. Combined with H12, nothing at any layer stops a bad
value from being stored. Adding them requires a table rebuild in SQLite (you can't
`ALTER TABLE ADD CONSTRAINT`), so it's a `CREATE new / INSERT SELECT / DROP / RENAME`
migration — which is exactly why C1 should be fixed first.

**What was done, and what wasn't.** `status` got the constraint on both tables (016).
`type` deliberately did **not**: `CLAUDE.md` makes the assignment type list explicitly
extensible ("add or change types only in `shared/types.ts`"), and a CHECK would quietly
make that untrue — adding `Presentation` would then need a second edit plus a rebuild
migration, and forgetting it would fail at runtime instead of at compile time. A
constraint fits a settled enum and fights an open one. Type is still validated at the
IPC boundary (H12), which is where an open enum belongs.

**The trap this exposed**, worth recording because it would have silently destroyed
data: with foreign keys ON, `DROP TABLE assignments` performs an implicit `DELETE` of
every row, which fires `ON DELETE CASCADE` — wiping every subtask and study block in the
database. And `PRAGMA foreign_keys` is a **no-op inside a transaction**, so a migration
file cannot turn it off for itself; the runner has to do it around the `BEGIN`. Hence
the new `foreignKeysOff` flag, plus a `PRAGMA foreign_key_check` before each such commit.
Confirmed empirically: running 016 without the flag destroyed all 5 seeded subtasks and
the study block; with it, everything survived.

### M3. ✅ FIXED — `deleteTerm` runs two writes without a transaction
**`src/main/db/repositories/termRepo.ts:41–45`** — it nulls `courses.term_id` and then
deletes the term as two independent statements. If the second fails, courses have been
silently unfiled from a term that still exists. Every other multi-write path in the repo
layer (`deleteCourse`, `restoreCourse`, `createAssignments`, `createTasks`,
`createStudyBlocks`) is correctly wrapped — this one was missed.

### M4. ✅ FIXED — Apple Music polling spawns a subprocess roughly every second, app-wide
**`src/renderer/lib/queries/useAppleMusic.ts:13–28`; `src/renderer/app/Sidebar.tsx:117–141`**

`useAppleMusicStatus` polls every 5 s and `useAppleMusicPlayback` every 2 s. Each status
poll runs **two** `osascript` invocations (`appleMusicScript.ts:87, 96`) and each playback
poll runs one or two more, plus an artwork export to a temp file on every track change.
`MusicSection` is rendered by the **Sidebar**, so once the user picks a music mode this
runs on every screen, forever — including while they're writing notes or in Focus Mode.

Each `osascript` is a process spawn plus an Apple Events round-trip to Music.app. React
Query does pause `refetchInterval` when the window loses focus, which limits the damage,
but this is still steady background load on the user's machine for a glanceable widget.

**Fix sketch.** Back off hard when nothing is playing (poll status every 30 s, only poll
playback while `isPlaying`), and consider moving the polling into main behind a single
push channel so N mounted components can't multiply it.

### M5. ✅ FIXED — Every `AssignmentRow` subscribes to the entire subtasks list
**`src/renderer/features/courses/AssignmentRow.tsx:43–45`** — `useSubtasks()` with no
filter, then `.filter(s => s.assignment_id === assignment.id)` client-side. React Query
dedupes the *fetch*, so this is one IPC call — but every row re-renders whenever any
subtask anywhere changes, and each row does an O(total subtasks) scan per render. With 40
assignments open on This Week that's 40 full scans per keystroke in the subtask editor.

**Fix sketch.** Lift the subtask fetch to the list component and pass each row its own
slice, or group once into a `Map<assignmentId, Subtask[]>` in a `useMemo` at the parent.

### M6. ✅ FIXED — The timer snapshot writes to `localStorage` once per second
**`src/renderer/store/useTimerStore.ts:510–521`** — the `subscribe` fires on every `set()`,
and `tick()` sets `timeLeft` every second while running. `localStorage.setItem` is a
*synchronous* main-thread write. It's a small object so the cost is small, but a
once-per-second synchronous disk-backed write for state that only needs to survive a quit
is the wrong trade. Persist on `isRunning`/`phase`/`endsAt` transitions (and on
`beforeunload`), not on `timeLeft`. Related to C3 — both go away if the snapshot moves to
the main-process settings file.

### M7. ✅ FIXED — Batch Add has no unsaved-changes guard
**`src/renderer/features/courses/BatchAddPage.tsx`** — the whole point of this screen is
typing 40 rows in one sitting (PRD §8.7 calls fast entry "a priority, not a nice-to-have").
Clicking "Cancel", the back link, or any sidebar nav item discards all of it instantly,
with no prompt and no draft. There's also no draft persistence, so an accidental app quit
loses the same work.

**Fix sketch.** A `useBlocker` (react-router v7 supports it) or a simple confirm on
navigation when `rows` has any non-empty content; optionally autosave the grid to the
settings file so it survives a relaunch.

### M8. ✅ FIXED — Save confirmation is inconsistent across dialogs
Quick Add, the assignment row toggle, course delete, meeting delete, and the reschedule
bar all show a toast (several with Undo — this part is genuinely well done). But
`AddAssignmentDialog`, `AddTaskDialog`, `ClassMeetingDialog`, `SemestersSection`, and
`GradeSectionsCard` show nothing: the dialog just closes. On a local-first app where saves
are instant, "the dialog closed" is the *only* signal the user gets, and it's the same
signal as "I hit Escape."

**Fix sketch.** Route every create/update through `showToast` / `showUndoToast` the way
`QuickAddDialog` does. The infrastructure already exists; it's a consistency pass.

### M9. ✅ FIXED — Study sessions can't be deleted or corrected
**`src/preload.ts:95–99`; `studySessionRepo.ts`** — the API surface is `list`, `create`,
`update` (intention/reflection only). There is no delete, and no way to fix a duration.
A session logged by mistake — or by C3 — is permanent, and it silently skews the heatmap,
the Dashboard's "focused this week", and the Weekly Review. For a personal-history feature,
"you can never remove an entry" is a hard edge.

### M10. ✅ FIXED — Assignment delete-undo is lossy but presents as a full undo
**`src/renderer/features/courses/AssignmentRow.tsx:73–89`** — undo calls
`createAssignment` with a **new** id. Lost in the round trip: all subtasks (cascade-deleted,
acknowledged in the comment), all planned study blocks (cascade), all note links (deleted by
the IPC handler), the original `created_at`, and the `completed_at` timestamp. The toast says
"Undo" and the user reasonably reads that as "put it back."

Compare `deleteCourse`/`restoreCourse`, which do this properly — full snapshot, same ids,
one transaction. The pattern already exists in the codebase; the assignment path just
doesn't use it.

**Fix sketch.** Mirror the course pattern: an `AssignmentSnapshot` returned from delete,
restored by id. Or, at minimum, change the toast copy so it doesn't over-promise.

### M11. ✅ FIXED — Spotify tokens are silently discarded when `safeStorage` is unavailable
**`src/main/spotify/spotifyAuth.ts:89–93`** — `saveTokens` returns early if
`safeStorage.isEncryptionAvailable()` is false, and `exchangeCode` still returns `true`.
The renderer shows "Connected!", then the very next `status` call finds no tokens and
reports disconnected — an unexplainable loop for the user. This is real on Linux without a
keyring and possible on a misconfigured macOS keychain. Surface it: return a distinct
"couldn't securely store the connection on this system" result and say so in the UI.

### M12. ✅ FIXED — Notification permission is only requested on the Study page
**`src/renderer/features/study/StudyPage.tsx:307–312`; `useTimerStore.ts:67–68`** — the
timer's phase-end notification checks `Notification.permission !== 'granted'` and returns.
Permission is only ever requested by an effect on `StudyPage`. A user who runs the timer
from Focus Mode or sets it up via ⌘K without visiting Study never gets asked, and the
notifications simply never appear — with no explanation. Request on first timer start
instead, or on app launch alongside the reminder config push.

### M13. ◑ PARTLY FIXED — No renderer tests at all
**`vitest.config.ts`** — `environment: 'node'`, `include: ['src/**/*.test.ts']` (no `.tsx`),
and coverage is scoped to `src/shared/**` + `src/main/db/repositories/**`. That's a
deliberate, defensible boundary and the tested parts are tested well (423 tests). But it
means every bug in this document from H3 onward lives in untested territory, and there is
no test anywhere for the IPC handlers — the layer whose whole job is validation.

**Fix sketch.** Handler tests are the cheaper win: they're plain functions over a
`DatabaseSync` you can point at `:memory:` (the `__tests__/helpers.ts` you already have
does most of this). Renderer tests need jsdom + Testing Library, which is a bigger lift —
worth doing for `useTermFilter`, the timer store, and one dialog, not for everything.

**Done:** the handler half. 22 tests over the three validating handler files, with
`ipcMain` stubbed and `getDb()` on an in-memory database — the real validation and the
real SQL, no Electron process. Those files are now in the coverage gate.

**Still open, and it's your call:** renderer component tests need `jsdom` +
`@testing-library/react` as new dev dependencies. `CLAUDE.md` says to ask before adding
deps, so I didn't add them unilaterally. If you want them, the highest-value first
targets are `useToday`, `useTermFilter`, and `ErrorBoundary` — all small, all currently
verified only by driving the packaged app.

### M14. ⏸ NOT CHANGED (deliberate) — Every navigation remounts the whole page
**`src/renderer/app/Layout.tsx:56`** — `<main key={location.pathname}>` forces a full
unmount/remount on each route change to replay the entry animation and reset scroll. It's
documented as intentional and the data survives in React Query's cache, so nothing breaks.
But it does throw away all component state (filter selections, expanded rows, in-progress
dialog state) and re-runs every effect on every nav — including a re-mount of BlockNote when
returning to a note. Worth knowing you're paying for it; a scroll-reset via `useEffect` plus
a CSS animation keyed differently would get the same effect for less.

**Left as-is, deliberately.** This is a working, documented tradeoff rather than a defect:
the remount is what produces the screen transition and the scroll reset, and both are
visible product behaviour. Changing it means re-deriving those two effects by hand and
re-testing every screen's entry animation — a real risk of regression in exchange for a
cost that isn't currently hurting anything (React Query holds the data, so no refetch
storm follows). The persisted filter stores (`usePageFiltersStore`) already protect the
state users would most notice losing. Revisit if a screen ever gets heavy enough that the
remount is visible; the note editor is the one to watch.

### M15. ✅ FIXED — Smaller UI/UX inconsistencies
- **"All semesters" is the last option** in both term selects (`DashboardPage.tsx:563`,
  `CoursesPage.tsx:97`) — after the terms, where nobody looks for the "everything" option.
  Conventionally it goes first.
- **The semester `<select>` on Course Detail writes on change** (`CourseDetailPage.tsx:213–225`)
  with no confirmation and no undo — a mis-click silently refiles a course into another term.
- **`meetings` on Course Detail has no loading or error branch** (`:65`, `:323`) — a failed
  load renders "No class times yet.", which is the empty state. This is the exact mistake
  `QueryErrorState`'s docstring warns against, applied correctly elsewhere on the same page.
- **`StudyPage`, `SettingsPage`, `BatchAddPage`, `NotebooksLandingPage`, `ClassNotebookPage`,
  and `ImportFeedPage` have no `isError` branch** at all.
- **⌘N opens Quick Add even when a dialog is already open**, stacking modals
  (`Layout.tsx:26–28`). ⌘Z has a guard for text fields; ⌘N and ⌘K don't.

---

### Verification of the Medium fixes

**The schema migrations (M1, M2) got the most scrutiny, being the only irreversible thing
in this batch.** Tested first against a *copy* of the real database, then run for real:

- Against the copy: 18 assignments and 16 tasks preserved byte-for-byte, seeded subtasks
  and study blocks untouched, indexes recreated after the table drop, foreign-key
  enforcement restored, cascades still firing on a real course delete, `integrity_check`
  clean.
- The trap, proven both ways: with `foreignKeysOff` the seeded children survived; without
  it the same migration destroyed all 5 subtasks and the study block. The flag is
  load-bearing, not decoration.
- `createTestDb()` now builds the schema the same way production does — otherwise the
  suite would sail past exactly this class of mistake, since an empty database has
  nothing to lose.
- Then run against the live database via a packaged build: both migrations recorded,
  every table row-for-row identical against a pre-launch snapshot, `integrity_check` ok,
  `foreign_key_check` clean, both CHECK constraints present, 15 indexes in place.

**Everything else:** all 9 routes re-smoke-tested in the packaged app against the migrated
data — zero CSP violations, zero console errors, and the reordered semester dropdown
visible in the rendered output. 466 tests passing (up from 437), coverage 89.7%
statements / 83.6% branches against gates of 80/75. `typecheck` clean, `lint` 0 errors.

**Not exercised end-to-end:** the Spotify no-keychain path (M11) and the Apple Music
polling back-off (M4) both need the respective services and, for M11, a machine without a
working keychain — reasoned from the code rather than run.

---

## Low

> **Status: all fixed** (2026-07-26). Two were resolved differently from the sketch —
> L4 and L5 — with the reasoning recorded in place.

### L1. ✅ FIXED — Two raw NUL bytes make `ImportFeedPage.tsx` a binary file to every text tool
**`src/renderer/features/import/ImportFeedPage.tsx`, in `existingKey()` (~line 54)** —
the de-dup key uses literal `\x00` bytes as field separators. `file` reports the source as
`data`, and `grep`/`git grep`/`ripgrep` refuse to search it by default (I hit this mid-audit).
The intent — a separator that can't appear in user text — is sound; write it as the escape
sequence `\u0000` in the template literal rather than embedding the raw byte, so the
file stays plain text.

### L2. ✅ FIXED — Documented structure that doesn't exist
`CLAUDE.md` specifies `src/main/db/schema.sql` ("table definitions") — there is no such file;
the schema lives only in the ordered migrations. That's arguably the better design (one source
of truth), but the doc should say so. `CLAUDE.md` also still describes `better-sqlite3` in one
place and `node:sqlite` in another.

### L3. ✅ FIXED — `PRD.md` has drifted a long way from the app
The PRD describes six screens. The app ships: a full block-based notes system with FTS search,
versioning, and image assets; Spotify OAuth + AppleScript playback; Apple Music via AppleScript;
Windows SMTC now-playing; desktop reminders + a due digest; a menu-bar tray with "up next";
auto-update; ICS/Canvas feed import; PDF syllabus extraction; a Weekly Review; Focus Mode with
ambience, a parking lot, and reflections; study-block back-planning; a semester setup wizard;
backup/restore; and three themes. None of that is in the PRD. The `[ADDED June 2026]` amendment
notes show the habit is there — it just stopped. Either fold the new surface area in or add a
"§12 — Beyond the PRD" index pointing at `PRODUCT.md`/`DESIGN.md`.

### L4. ✅ FIXED (differently) — Unchecked row casts throughout the repository layer
Every repo has `function row(r: unknown) { return r as Course; }` with the comment "safe because
the columns exactly match." That's true today and is a reasonable pragmatic choice — but it's a
lie TypeScript can't check, and it's the thing that will go quietly wrong when a migration renames
a column. If it ever bites, a single `assertShape` in dev builds (checking required keys exist)
costs almost nothing. Same family: `getCourse(id)!` / `getAssignment(id)!` after every insert —
the 83 lint warnings are almost all of these.

### L5. ✅ FIXED (differently) — SVG is in the note-image MIME allowlist
**`src/main/media.ts:24`** — SVG can carry `<script>`. Served from a `secure`, `standard` custom
scheme and rendered via `<img>`, scripts don't execute, so this is not currently exploitable.
It becomes one the moment a code path renders an asset inline or in an `<object>`/`<iframe>`, and
it's the kind of thing a CSP (C2) would otherwise contain. Consider dropping `svg` unless you have
a reason to want it.

**Fixed by neutralising it rather than removing it.** Asset responses now carry
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` plus
`X-Content-Type-Options: nosniff`. That makes an SVG inert *whatever* loads it — `<img>`,
`<object>`, or a direct navigation — so the property we're relying on stops being "the
current code only ever uses `<img>`" and becomes a property of the response itself. Dropping
the format would also have broken any SVG already sitting in a note, for a risk that a
header closes completely.

### L6. ✅ FIXED — `feeds.fetchIcs` will fetch any http(s) URL from the main process
**`src/main/ipc/registerFeedHandlers.ts:15–55`** — the handler correctly rejects non-http(s)
schemes, times out, caps the body, and sanity-checks for `BEGIN:VCALENDAR`. It does not restrict
the *host*, so a pasted URL can reach `localhost` or LAN addresses, and redirects are followed.
The user types the URL themselves, so the threat model is thin — worth noting rather than fixing,
unless you ever accept a feed URL from anywhere but a human.

### L7. ✅ FIXED — `console.log`s in the Spotify auth path
**`spotifyAuth.ts:148, 161`** — logs the OAuth `state` parameter and the exchange outcome to
stdout on every connect. Harmless locally; drop them or gate them behind `!app.isPackaged`.

### L8. ✅ FIXED — Assorted small things
- `parseInt` without a radix in several places (`playPlaylist`, `playTrack`, `applyDueFilter`,
  the Apple Music parsers). Harmless with these inputs, but `parseInt(x, 10)` is the habit.
- `BatchAddPage`'s `nameRefs.current` map (`:58`) is never pruned when rows are removed — a small
  unbounded object for a long session.
- The repeat panel's `repeatUntil` / `repeatWeeks` are page-level state shared by all rows, so
  opening the panel on a second row shows the first row's settings.
- `sendTestNotification` reports `{ supported: false }` when notifications are unsupported, but
  nothing distinguishes "unsupported" from "OS permission denied" — the most common real case.
- ✅ `parseInt` given an explicit radix at all 14 call sites that lacked one (`colors.ts`
  already passed 16 deliberately). Verified behaviour-preserving across every input shape
  these sites actually see.
- ✅ `BatchAddPage`'s `nameRefs` map now drops an entry when its row is removed — it was
  holding a detached DOM node reference for every row ever deleted.
- ✅ The repeat panel's settings reset when it moves to a different row. They were
  page-level, so opening Repeat on row 7 showed row 2's leftover "until" date — which
  reads as a value that applies, and silently generates the wrong series.
- ✅ `sendTestNotification` now distinguishes "this platform can't" from "your system
  didn't". `isSupported()` returns true on a Mac with notifications switched off for the
  app, which is the common real failure; it now also waits briefly for the `show` event,
  which stays silent when the OS suppresses the notification.
- **Checked, not a bug:** I was concerned that `VACUUM INTO` (used by backup and by the pre-restore
  snapshot) could renumber `notes.rowid` and desynchronize the external-content `notes_fts` index,
  silently breaking note search after a restore — SQLite's docs warn rowids "may change" for tables
  without an `INTEGER PRIMARY KEY`, which `notes` is. I reproduced the scenario against `node:sqlite`
  with rowid gaps and **rowids were preserved**; search and `integrity-check` both passed. Leaving it
  here because it's a latent dependency on unspecified behavior — an
  `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')` after a restore would make it explicit and
  costs nothing.

---

## Where I'd start

Ordered by (value delivered) ÷ (risk of breaking something that works today).

**1. Add `eslint-plugin-react-hooks` and run `npm run lint` in CI.** (H8)
Pure tooling — it cannot break a running app. It's first because it's a *multiplier*:
`exhaustive-deps` would have found H5 and H7 on its own, and it will keep finding that
class of bug in every screen you write from here. Turn it on as a warning, work the list
down over a few sittings, then promote to error. Everything below this line is a bug you
fix once; this is the thing that stops the next ten.

**2. Wrap each migration in a transaction.** (C1)
Roughly ten lines in one function, in a code path that already works — the risk of the
change is near zero, and the risk it removes is the only one in this codebase that can
permanently destroy a student's semester with no recovery. It also has to come before M2
(adding CHECK constraints requires a table-rebuild migration, which is exactly the kind
you don't want running non-atomically). Test it by deliberately adding a migration with a
bad second statement and confirming the app still starts.

**3. Fix the term filter hiding un-termed courses.** (H4)
A one-line predicate change on two pages. It's third because it's the most *frightening*
bug on the list from the user's side — "I added a course and the app says I have no
courses" is indistinguishable from data loss, and it fires on the very first thing a new
student does after running the setup wizard. High user impact, trivially small and
reversible diff.

**4. Fix the updater repo slug and the `canvasFeedUrl` allowlist entry.** (H1, H2)
Two one-line fixes that between them resurrect two features that are currently dead and
give no indication of it. Bundled together because they share a root cause worth naming:
both are *string keys that must match something else*, with a silent failure when they
don't. While fixing H2, make `setSetting` warn on unknown keys — that converts this whole
category from invisible to obvious.

**5. Make "today" reactive.** (H3)
A small shared `useToday()` hook plus three call sites. It's last of the five because it's
the largest of them, but it's still contained and testable, and it fixes the app's core
promise — PRD §2's "what's due soon, answerable in under 5 seconds" — for exactly the user
who leaves the app open all week, which is the user this app is for.

**Deliberately not in the top five:** the CSP (C2). It's the most important security item
here, but it isn't low-risk — BlockNote and Mantine inject inline styles, artwork arrives as
`data:` and `https:` URLs, notes load over `studeo-asset://`, and dev needs a different
policy than production. Do it as its own focused piece of work with a packaged build to
test against, right after the five above. And verify C3 (the duplicate study sessions)
early — it's a five-minute experiment with a packaged build, and the answer tells you
whether you have a data bug or a dead feature.

---

## Full verification pass — 2026-07-26

Everything below was run after the final change, against a freshly packaged build.

**Static** — `typecheck` clean · `lint` 0 errors / 98 warnings (all `no-non-null-assertion`,
mostly in tests) · **466 unit tests passing** across 31 files · coverage 89.7% statements,
83.6% branches against gates of 80/75.

**Schema — 45 assertions** (the only irreversible work here, so it got the most):
- A fresh database built from all 16 migrations: every table present, every index created,
  FTS search working end to end, `integrity_check` ok.
- The real upgrade path, a genuine v014 database → v016: all six tables preserved,
  assignment rows byte-identical, `foreign_key_check` clean, FK enforcement restored, both
  CHECK constraints rejecting bad values and accepting good ones, and cascades still firing
  through the rebuilt tables.
- Idempotency: three consecutive runner passes add no duplicate rows and change no data.
- The `foreignKeysOff` flag proven load-bearing — the same migration without it destroys
  every subtask and study block.
- C1 regression: a deliberately broken migration still throws, rolls back its half-applied
  column, and leaves user data intact.

**Behaviour — 22 assertions** on the pure logic changed in the Low batch: the `\u0000`
escape produces byte-identical de-dup keys to the raw NUL it replaced; the loopback guard
blocks all 11 loopback/link-local forms while leaving LAN and real feed hosts reachable;
the `parseInt` radix change is behaviour-preserving on every input these sites see.

**End to end — 28 assertions** driving the packaged app over the remote debugging port:
- All 12 routes render real content, including `#/import` and `#/setup`.
- **M7 exercised for real**: typed into the batch grid, navigated away, came back — the
  draft banner appeared and the typed text was still there. Cleaned up after itself.
- **H10 regression**: induced a real render throw; the boundary caught it, the sidebar
  survived, navigating away recovered.
- **H3 regression**: advanced the page's clock three days; the Dashboard moved from Sunday
  July 26 to Wednesday July 29 and back.
- **C2 regression**: `window.open` denied, external navigation refused.
- **M15**: "All semesters" confirmed first in the dropdown.
- Zero CSP violations, zero console errors.

**Data safety:** your real database was snapshotted before the run and compared after —
row counts unchanged, `integrity_check` ok, `foreign_key_check` clean, 16 migrations applied.

**Not covered anywhere:** the Spotify no-keychain path (needs a machine without a working
keychain), the Apple Music polling back-off (needs Music.app), and the notification
`show`-event heuristic (needs a real OS notification round-trip). All three are reasoned
from the code, not executed.
