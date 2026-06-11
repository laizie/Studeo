# Studeo — Full App Audit Checklist

> Generated June 11, 2026 from a complete codebase review: every screen (Dashboard, Courses, Course Detail, Batch Add, This Week, Tasks, Calendar, Study, Settings), every dialog (Create Course, Add Assignment, Add Task, Quick Add, Class Meeting, Study Picker, Spotify Setup), both music panels, all stores, the app shell, and all three theme layers. Deterministic anti-pattern detection was run across `src/renderer`. Verified against `PRD.md`, `PRODUCT.md`, and `DESIGN.md`.
>
> **Scope notes:** Studeo is a desktop Electron app — "mobile usability" is assessed as responsive behavior within a resizable window, not phone layouts (mobile is explicitly out of scope per PRD §10). Review is source-based; findings that need live visual confirmation are marked *(verify live)*.

---

# Executive Summary

Studeo is in strong shape for a v1. The information architecture genuinely serves the core question ("what's due, what now?"), the warm-espresso identity is distinctive and consistent in structure, empty/loading states exist nearly everywhere, and several features (syllabus import, focus list, technique presets) show real product thinking beyond the PRD.

The audit found **no broken core flows**. The dominant problems are systemic rather than local:

1. **Contrast below WCAG AA is the #1 issue, app-wide.** Muted text (`stone-300`/`stone-400`) appears as body/meta text in **18 remaining files** (~100 instances). Dashboard and Study were already remediated in the June 10 passes; the same fix needs to sweep the rest.
2. **Calendar event chips hard-code white text on course colors** — illegible on all 14 pastel course colors and on the completed-gray state. This is the single worst visual defect in the app.
3. **The urgency-badge color vocabulary is duplicated in 3 files**, and two copies still carry the failing pre-fix values. This is a token/abstraction gap, not just a styling bug.
4. **The "dark" theme is unreachable.** The theme picker offers Light and Warm only; the complete dark CSS layer (`#332211` family) ships as dead weight under Warm. Decide: expose it or fold it.
5. **Two features the product describes don't fully exist:** lecture-time reminders (no code at all — PRD slots it for v1.1) and the long-break Pomodoro phase (the timer has only `focus | short_break`).

**Already remediated this week** (June 10 session): Dashboard stat-row redundancy, dashboard + study contrast, dashboard error-vs-empty state, semantic section headings, dashboard/study hover-reveal accessibility, the Pomodoro timer-freeze architecture bug (now survives navigation, drift-free, shows in window title, Space/R keyboard control), study selection-grammar unification, and app-wide `prefers-reduced-motion` support.

---

# Critical Issues

Fix these first. All are P0/P1.

### C1. Calendar event chips are illegible *(P1 — worst visual defect)*
- **Where:** `CalendarPage.tsx:197–225` (`eventPropGetter`)
- **What:** `color: 'white'` is hard-coded on every event. On pastel course colors (half the palette — e.g. Pastel Amber `#f5dfa0`, Pastel Teal `#a8ece8`) white text is ~1.3–1.6:1. Completed events are white-on-`#d6d3d1` (~1.5:1).
- **Fix:** Compute text color from background luminance (dark ink `#1e1208` on pastels/light grays, white on saturated darks). One small helper; apply to both branches.

### C2. App-wide muted-text contrast failures *(P1 — systemic)*
- **Where:** 18 files still use `text-stone-300` (~1.5:1) or `text-stone-400` (~2.5:1) for real text. Worst offenders: `SettingsPage` (12), `AppleMusicStudyPanel` (15), `BatchAddPage` (11), `SpotifyStudyPanel` (10), `StudyPickerDialog` (9), `CourseDetailPage` (8).
- **Fix:** Apply the established rule from the dashboard/study passes: never `stone-300` as text; meta/secondary → `stone-500` minimum; placeholders included (`BatchAddPage` INPUT uses `placeholder:text-stone-300`). Also re-check warm-theme tokens: `#c4a882` text on the warm surface `#7e5a38` is ~2.1:1 *(verify live)* — the `dark:` text tokens were tuned for the darker `#553311` surface and Warm lightens the surface under them.

### C3. Duplicated, partially-stale urgency vocabulary *(P1)*
- **Where:** `URGENCY_CLASS` defined independently in `DashboardPage.tsx` (fixed values), `AssignmentRow.tsx:29–37` and `TaskRow.tsx` (stale: `soon: text-amber-600` ~3.1:1, `week: text-green-600` ~2.9:1 — both fail AA at 12px).
- **Fix:** Extract one `URGENCY_CLASS` (and the urgency badge component) to a shared module — `renderer/lib/urgency.ts` or alongside `shared/deadlines.ts` — with the AA-passing `-700` values. Three copies of a semantic vocabulary is how the dashboard got fixed while This Week silently didn't.

### C4. Missing/misleading error states *(P1)*
- **Where:** `TasksPage`, `ThisWeekPage`, `CalendarPage`, `CourseDetailPage` have **no** `isError` branch (a failed query renders as an empty state — "your data is gone"). `CoursesPage.tsx:98–102` has one, but the copy is "Restart the app and try again" with no retry button.
- **Fix:** Reuse the dashboard's error pattern (icon + honest copy + amber "Try again" calling `refetch`) as a shared `QueryErrorState` component; replace the Courses copy.

### C5. The `study_sessions` ghost table *(P1 — data loss)*
- **Where:** Table exists in `001_initial.sql`, `StudySession` type exists in `shared/types.ts` — no repo, no IPC, no writes. Completed focus sessions vanish. (Carried from `REVIEW.md`.)
- **Fix:** Either wire it end-to-end (repo → IPC → log on focus-phase completion; unlocks study stats) or remove the table + type so the schema doesn't lie. Recommend wiring it — it's the cleanest full-recipe exercise and enables the highest-value Phase 3 feature.

---

# Design Improvements

### Visual hierarchy & consistency
- **D1. Three selection grammars → one.** White-segmented (This Week tabs, Calendar mode, Course Detail filters, Study post-fix) vs. **amber-filled pills** (`SettingsPage` `PillGroup:69–74`) vs. amber nav-active. Rule to adopt: *white-segmented for option pickers; amber only for nav-active and primary actions* (per DESIGN.md's One Lamp Rule). Convert Settings `PillGroup`.
- **D2. Native `confirm()` dialogs (4 files)** — `CourseCard:19`, `AssignmentRow:56`, `TaskRow:49`, `CourseDetailPage:266`. OS-chrome dialogs break the visual language, can't be themed, and the course-delete one guards a cascading delete. Build one styled `ConfirmDialog` (danger variant for deletes) and replace all four.
- **D3. Semester delete has *no* confirmation** (`SettingsPage:362–368`) while every other delete confirms. Deleting a term silently un-groups its courses. Add the same `ConfirmDialog`.
- **D4. Button sizing drift.** Primary "Add" buttons vary: `px-3 py-2` (Dashboard, Courses) vs `px-3 py-1.5` (Tasks, Course Detail). Standardize on one (recommend `px-3 py-2` for page-level, `py-1.5` for in-card).
- **D5. Theme-picker active check is white-on-amber** (`SettingsPage:243–247`) — ~1.9:1. Use `#1e1208` (Amber Ink) per DESIGN.md.
- **D6. Music panels introduce gradients** (`bg-gradient-to-br from-[#fc3c44] to-[#ff6b6b]` play buttons in both panels). Minor brand deviation; flat brand color would match the system. Low priority.

### States
- **D7. Loading skeletons aren't theme-aware outside Dashboard.** `CoursesPage:92`, `ThisWeekPage`, `TasksPage`, `CourseDetailPage` skeletons use bare `bg-stone-100` — they flash light in Warm theme. Apply the dashboard's theme-aware block pattern.
- **D8. Calendar has no empty state.** A new user sees a blank month grid with no guidance. Add a one-line overlay/hint when `events.length === 0` ("Assignments you add will appear here — color-coded by course").
- **D9. Task events on the calendar do nothing when clicked** (`CalendarPage:192`). Dead interaction reads as broken. Navigate to `/tasks` (cheap) or open the edit dialog (better).

### Cognitive load & affordances
- **D10. The 3-state status cycle is undiscoverable.** Clicking the circle icon cycles not-started → in-progress → done (`AssignmentRow:16–21`), explained only in a `title` tooltip and a Settings tip. First-timers will miss in-progress entirely. Cheapest fix: a popover hint on first use, or right-click/long-press menu listing the three states. (Also: is `in_progress` earning its place? See F-Simplify.)
- **D11. Hover-only reveals remain in 6 files** — `AssignmentRow` (focus/edit/delete), `TaskRow`, `CourseCard` (delete), `CourseDetailPage` (meeting edit/delete), both music panels (play buttons). Invisible to keyboard users; `AssignmentRow`'s pattern also hides the *only* edit affordance. Apply the dashboard's `group-focus-within` + `focus-visible` + `aria-label` pattern everywhere.

---

# Theme Audit

The app has **three CSS theme layers** but only **two reachable themes** (`useSettingsStore.ts:3` — `Theme = 'light' | 'warm'`). Warm works by applying `.dark` *plus* `data-theme="warm"` overrides.

## Light (default)
- **Strengths:** The flagship. Cream body + white cards + hairline sand borders is cohesive and calm; full coverage on every screen; the rbc calendar needs no overrides.
- **Weaknesses:** All the muted-text contrast failures (C2) — cream makes borderline grays worse. `CourseCard` empty hint `text-stone-300:73`.
- **Fixes:** C2 sweep; C1 calendar chips.
- **Accessibility:** After the sweep, AA-clean. Focus rings (gray) are consistent and visible.

## Warm
- **Strengths:** Genuinely distinctive — the mid-brown surfaces feel like the brand at full commitment. Complete rbc calendar overrides exist (`index.css:143–166`). Coverage is thorough: nearly every component carries `warm:` variants.
- **Weaknesses:**
  1. **Likely-failing text contrast** *(verify live)*: muted tokens `#c4a882`/`#e0b870` were tuned for dark surfaces (`#553311`), but Warm lightens surfaces to `#7e5a38`/`#8e6a48` underneath them. `#c4a882` on `#8e6a48` is roughly 1.8:1.
  2. **Course pills** (`${color}40` tint + course-color text) sit on brown surfaces; dark course colors (Brown `#7b5c46`, Slate `#64748b`) approach invisibility.
  3. A few un-themed spots: `CourseDetailPage:230` "Class Schedule" heading and `:253` meeting time have no `dark:` token (renders dark-on-dark in Warm); `TasksPage:129` "Show completed" label likewise.
- **Fixes:** Audit Warm's text ramp against the *actual* warm surfaces, not the dark ones; bump `#c4a882`-on-surface roles to `#e8d5c0`; luminance-aware pill text (same helper as C1); patch the missing `dark:` spots.
- **Accessibility:** The riskiest theme today; treat the Warm text-ramp audit as part of the C2 sweep.

## Dark (defined but unreachable)
- **Strengths:** A complete layer — body, all components, full rbc overrides — already built and maintained under every `dark:` utility.
- **Weaknesses:** No way to select it. It exists only as Warm's substrate. Every `dark:` utility you write is maintenance cost for a theme no user sees.
- **Fixes (decide one):**
  - **(a) Expose it** — add `'dark'` to the `Theme` union, a third `ThemePicker` card, and `applyTheme` just adds `.dark` without `data-theme`. ~20 lines; instant third theme. *(Recommended — it's already built and students study at night.)*
  - **(b) Fold it** — if Warm is the only dark identity wanted, collapse `dark:`+`warm:` into one variant and delete the unreachable layer. Bigger refactor, simpler future.
- **Accessibility:** If exposed: `#e0b870` on `#553311` surfaces ≈ 4.6:1 (passes); `#cc9a58` empty-hints on `#332211` ≈ 4.1:1 (borderline — bump to `#e0b870`).

---

# Features To Add

Only items that serve "what's due / what should I do now" or the study loop:

| Feature | Priority | Reasoning | Impact |
|---|---|---|---|
| **Lecture-time reminders** | **High** | Listed in the product description and PRD v1.1, **currently absent from the codebase** (the Notification API is used only for timer phase-end). ClassMeeting data already exists; main process can schedule next-meeting notifications. | The single biggest gap between what Studeo says and does. |
| **Long-break phase** | **High** | PRD §8.6 specifies Focus / Short break / Long break; the store has only two phases (`useTimerStore.ts:3`). Standard Pomodoro is 4 focus blocks → long break. Add a cycle counter + `long_break` phase. | Completes the core study feature to spec. |
| **Study stats on Dashboard** | Medium | Once C5 wires `study_sessions`, a one-line "3.5 hrs focused this week" on the Dashboard closes the motivation loop. Keep it one quiet line — not a metric-tile cockpit (PRODUCT.md anti-reference). | Makes focus time visible; reinforces the habit. |
| **Persist running timer across app restart** | Low | `endsAt` is already wall-clock; persisting it + phase to `localStorage` makes sessions survive a quit/relaunch. | Small trust win. |
| **Mini timer indicator in sidebar** | Low | The window title now shows the countdown; a small sidebar chip (time + phase color) would make it visible in-app from any screen. | Nice-to-have; title bar may be enough. |

# Features To Remove

- **The unreachable Dark CSS layer** — *if* option (b) above is chosen. Otherwise nothing: the app is admirably free of bloat. (The June 10 work already removed the one bloat item found — the dashboard stat-tile row.)
- **`study_sessions` table + type** — only if the team decides *against* wiring it (C5). Don't keep a schema that lies.

# Features To Improve

| Feature | What's wrong | Improvement |
|---|---|---|
| **Status cycling** | Undiscoverable 3-state click cycle (D10). Also worth asking: does `in_progress` carry its weight, or would done/not-done be calmer? PRD §11 left this open. | Add the affordance; or simplify to 2 states if usage doesn't justify 3. |
| **Course Detail vs PRD** | PRD §8.2 specifies a per-course month calendar; the page ships without it. The two-column assignments+schedule layout is arguably *better* (calmer), but the drift is undocumented. | Decide deliberately: add a compact month strip, or amend the PRD. Don't leave it silent. |
| **Calendar task events** | Click does nothing (D9). | Navigate or open edit. |
| **Syllabus import** | Works well, but errors are silent — `handleImport` with 0 parsed rows just does nothing (`BatchAddPage:115–117`). | Show "No assignments found in that text" feedback. |
| **Batch save** | Sequential `await` per row (`BatchAddPage:138–145`) — fine at student scale, but one failure mid-loop saves half the rows with a generic error. | Batch IPC call or at least report which rows saved. |
| **Auto-advance default** | Off by default; classic Pomodoro flow expects focus→break to chain. | Consider defaulting on (with the existing toggle to opt out). |
| **Quick Add** | Settings tip says it "remembers which tab you last used" — true only within a session (component state). | Persist the tab choice, or soften the tip copy. |

---

# Accessibility Improvements

Ordered by impact; items 1–3 overlap Critical:

1. **Contrast sweep (C2)** — light theme `stone-300/400` text, Warm-theme tan-on-brown ramp, calendar chips (C1), urgency badges (C3), theme-picker check (D5).
2. **Hover-reveal sweep (D11)** — 6 files; `group-focus-within` + `focus-visible:opacity-100` + real `aria-label`s (most icon buttons currently have only `title`).
3. **`aria-pressed` on toggles** — focus-list stars (done on Dashboard), Tasks/Calendar toggle switches (currently bare `<button>` + visual switch; add `role="switch"` + `aria-checked`).
4. **Status-cycle button** — announce state: `aria-label="Status: in progress — click to mark completed"`.
5. **Confirm dialogs (D2)** — the styled replacement must trap focus and return it on close (the existing dialogs handle Escape but don't trap focus — worth adding while you're in there).
6. **Screen-reader timer announcements** — an `aria-live="polite"` region announcing phase changes ("Focus session complete — break started") to complement the chime/notification.
7. ~~`prefers-reduced-motion`~~ — **done** (global, June 10).

# Performance Improvements

The renderer is healthy — memoization discipline is genuinely good across pages. Only small items:

1. **Dashboard per-course count** — `allAssignments.filter()` inside the Courses-list `.map()`; precompute a count map like `CoursesPage:34–44` already does (the better pattern exists in-repo — copy it).
2. **Batch save round-trips** — N sequential IPC calls; a single `assignments:createMany` handler would be more robust *and* faster (see Features To Improve).
3. **Calendar meeting expansion** is correctly range-bounded (`expandMeetingsForRange`) — no action.
4. Bundle: `react-big-calendar` + `date-fns` are the heavy deps and both earn their place. No action.

# Polish Opportunities

Small details toward premium feel:

1. **One shared `INPUT_CLASS`** — three near-identical copies exist (`CreateCourseDialog:24`, `QuickAddDialog:16`, `BatchAddPage:25`, plus inline variants in Settings). Single source in `lib/`.
2. **Token layer** — the brown theme hexes (`#553311`, `#442918`, `#e8ddd0`, `#7e5a38`…) are repeated inline hundreds of times. Promote to CSS variables (`--surface`, `--border`, `--surface-hi`) in `index.css`; cuts class-string noise massively and makes the Dark-theme decision (Theme Audit) nearly free. This is the highest-leverage refactor in the codebase.
3. **Empty-state warmth pass** — Courses ("No courses yet.") and Tasks ("No tasks yet.") are terser than the Dashboard's encouraging voice. One sentence of warmth each, per the brand.
4. **`text-wrap: balance`** on page titles and dialog headings; `tabular-nums` audit (mostly present — `CourseCard:59` already does it right).
5. **Batch-add footer hint** (`Enter to jump rows · Tab to move`) — currently `stone-300`; make it readable (part of C2) — it's teaching the page's best feature.
6. **`window.confirm` for course delete mentions cascading** ("will also delete all its assignments") — when D2 replaces it, keep that copy; it's the most important sentence in any dialog in the app.
7. **Dialog scrims** are `bg-black/30` consistently — good; consider `backdrop-blur-[2px]` only if it stays smooth in Electron *(verify live)*.

---

# Final Priority Roadmap

## Phase 1 — Immediate (correctness + AA compliance)
1. **C1** Calendar chip text color (luminance helper) — worst visible defect, ~1 hour.
2. **C3** Consolidate `URGENCY_CLASS` into one shared module with AA values — unblocks This Week/Course Detail instantly.
3. **C2** App-wide muted-text sweep (18 files), including placeholders and the Warm-ramp audit.
4. **C4** Shared `QueryErrorState` + wire into Tasks, This Week, Calendar, Course Detail; fix Courses copy.
5. **D3** Confirmation on semester delete (interim: native `confirm` like the others; proper dialog in Phase 2).

## Phase 2 — Important (consistency + completeness)
6. **D2** Styled `ConfirmDialog`, replace all 4 native `confirm()`s + the new semester one; focus-trap included.
7. **D11** Hover-reveal + `aria-label` sweep (6 files).
8. **Theme decision** — recommend exposing Dark as a third theme (~20 lines); fix the handful of un-themed Warm spots; Warm text-ramp bumps.
9. **Long-break phase** in the timer store + Study UI.
10. **C5** Wire `study_sessions` (repo → IPC → log on focus completion).
11. **D1** Settings `PillGroup` → segmented style; **D4** button sizing; **D7** theme-aware skeletons; **D8/D9** calendar empty state + task-event click.

## Phase 3 — Future enhancements
12. **Lecture-time reminders** — the missing headline feature (main-process scheduling off ClassMeeting data; needs a Settings toggle and a small notification-permission flow).
13. **Token layer extraction** (CSS variables) — do this *before* any further theme work compounds the inline-hex debt.
14. **Study stats line on Dashboard** (depends on #10).
15. Persist timer across restart; sidebar mini-timer; status-model simplification decision (2 vs 3 states); PRD §8.2 course-calendar decision; Quick Add tab persistence; syllabus-import empty feedback; batch IPC save.

---

*Cross-references: per-screen scored critiques with persona walkthroughs live in `.impeccable/critique/` (Dashboard 28/40 and Study 28/40 pre-fix snapshots). Engineering-level findings carried from `REVIEW.md` where they affect UX. Design-system rules cited here are defined in `DESIGN.md`; strategic principles in `PRODUCT.md`.*
