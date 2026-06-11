# ClassTrack — Product Requirements Document

> **Working title:** "ClassTrack" (rename freely — used as a placeholder throughout this doc and in `CLAUDE.md`).
> **Status:** Draft v0.1 — desktop MVP scope. Items I added beyond your original spec are marked **[ADDED]** so you can keep or cut them.

---

## 1. Overview & Vision

ClassTrack is a desktop app for high-school and college students to track classes, assignments, and study sessions in one place. The look-and-feel target is **Notion**: clean, calm, lots of whitespace, subtle borders, rounded corners, a left sidebar for navigation, and color used sparingly but meaningfully (per-class accent colors).

The MVP is a **single-user, local-first desktop app** for Windows and macOS. Phone/tablet and cloud sync are explicitly out of scope for v1 (see §10).

## 2. Goals / Non-Goals (MVP)

**Goals**
- Run on Windows and macOS from a single codebase.
- Let a student model their semester: courses, assignments, recurring lecture times, and one-off tasks.
- Make "what's due soon and what should I do right now" answerable in under 5 seconds.
- A focused study mode with a Pomodoro timer and a lightweight music control.
- Notion-grade visual polish.

**Non-Goals (for v1)**
- Multi-user accounts, login, or sharing.
- Cloud sync across devices.
- Mobile/tablet apps.
- Importing from an LMS (Canvas/Moodle/etc.). *(Tracked as a future idea — see §10.)*
- Full music streaming/playback ownership (we integrate, we don't rebuild Spotify).

## 3. Target Users

- College students (primary) and high-school students managing multiple courses.
- Comfortable installing a desktop app; wants something nicer than a spreadsheet or a generic to-do app.

## 4. Platforms & Priorities

| Priority | Platform | Notes |
|---|---|---|
| P0 | Windows 10/11 (x64) | First-class |
| P0 | macOS (Apple Silicon + Intel) | First-class |
| P2 | Linux | Nearly free with Electron; ship if easy |
| Later | iOS / iPadOS / Android | Separate effort (see §10) |

## 5. Tech Stack (summary)

Full engineering detail lives in `CLAUDE.md`. Summary:

- **Shell:** Electron (same approach Notion uses).
- **UI:** React + TypeScript, bundled with Vite via **Electron Forge** (Vite + TS template).
- **Styling/components:** Tailwind CSS + shadcn/ui (Radix primitives) for the Notion-like UI.
- **Local data:** SQLite via **better-sqlite3**, running in Electron's main process; the UI talks to it over typed IPC.
- **Data fetching in UI:** TanStack Query (React Query) over the IPC layer.
- **Calendar views:** react-big-calendar (swappable).
- **Light UI state:** Zustand (timer, active filters).
- **Packaging:** Electron Forge makers / electron-builder → `.exe`/`.dmg` installers.

## 6. Design Principles (Notion-like)

- **Layout:** persistent left sidebar (nav) + main content pane. Optional top bar inside each screen for filters/actions.
- **Color:** neutral grays for chrome; each course owns one accent color used as a left border / dot / pill, never as a full background flood.
- **Typography:** one clean sans-serif, generous line height, clear hierarchy (page title → section → row).
- **Density:** comfortable, not cramped. Cards and list rows with soft separators.
- **Motion:** minimal, fast (hover states, small fades). No flashy animation.
- **Empty states:** every screen has a friendly empty state with a primary "create" action. **[ADDED]**
- **Theme:** ship light mode first; structure tokens so dark mode is a later flip. **[ADDED]**

## 7. Data Model

These map directly to SQLite tables. Times stored as ISO 8601 strings (or epoch ms) in UTC; format for display in local time.

### Course
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| name | text | e.g., "Programming Concepts — Java" |
| abbreviation | text | e.g., "CSC216" |
| color | text | hex or token id, drives all color-coding |
| building | text? | e.g., "EB2 1231" |
| term_id | text? | FK → Term **[ADDED]** |
| created_at | text | |

### Assignment
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| course_id | text | FK → Course |
| name | text | |
| type | text | fixed list (see below); defaults to "Assignment" |
| status | text | enum: `not_started` \| `in_progress` \| `completed` **[ADDED enum]** |
| due_date | text | date or datetime |
| notes | text? | optional |
| created_at | text | |

> **Assignment types (fixed list):** `Assignment` (default catch-all) · `Homework` · `Quiz` · `Exam` · `Project` · `Lab` · `Reading` · `Paper`. Stored as an enum defined once in `shared/types.ts`, so the list is trivial to edit. A fixed list keeps filtering clean and enables per-type icons/colors later.
>
> **Derived (not stored):** `deadline` label ("today", "tomorrow", "2 days", "Overdue") is computed from `due_date` vs now. Course **progress** = completed assignments ÷ total assignments.

### Task
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| name | text | |
| status | text | same enum as Assignment |
| due_date | text | |
| created_at | text | |

> Tasks are standalone (not tied to a course), per your spec. *(Optional `course_id` could be added later.)*

### ClassMeeting **[ADDED]**
Recurring lecture/lab times — needed for the calendar's "lecture schedule" view.
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| course_id | text | FK → Course |
| day_of_week | integer | 0–6 |
| start_time | text | "09:35" |
| end_time | text | "10:50" |
| location | text? | room/building |

### Term **[ADDED]**
Lets courses be grouped/archived per semester.
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| name | text | "Fall 2026" |
| start_date | text? | |
| end_date | text? | |

### StudySession **[ADDED, optional]**
For Pomodoro history/stats later.
| Field | Type | Notes |
|---|---|---|
| id | text (uuid) | PK |
| started_at | text | |
| duration_seconds | integer | |
| kind | text | `focus` \| `short_break` \| `long_break` |
| course_id | text? | optional link |

## 8. Feature Specifications (screens)

Navigation (sidebar): **Dashboard · Courses · This Week · Tasks · Calendar · Study**.

### 8.1 Class Overview (Dashboard)
The home screen. A grid of **course cards**, each showing:
- Color accent (course color).
- Course name + abbreviation (e.g., "CSC216").
- Building/location.
- Assignment count (and **[ADDED]** count remaining vs done).
- A **progress bar** = completed ÷ total assignments.

Clicking a card → Course Detail. Includes an "Add course" action and an empty state.

### 8.2 Course Detail
Opened from a course card. Two columns (stacking on narrow windows):
1. **Assignment list** with a filter: **"show assignments due within"** → `7 days` / `14 days` / `30 days` / `all`. Each row: name, type (or "Assignment"), status, due date, deadline label. Inline status toggle and add/edit/delete. Batch-add entry point lives here too.
2. **Class schedule** — the course's recurring meeting times (day, start–end), with add/edit/delete.

> **Amended June 2026:** the originally-specced per-course month calendar was deliberately dropped. The global Calendar (§8.5) already shows every course color-coded, and a second calendar on this page added bulk without answering "what's due" any faster. The class-schedule column replaced it.

### 8.3 This Week (Weekly Assignments)
A cross-course list of assignments due in the current week. Columns, in order:
**Assignment name · Type (or "Assignment") · Status · Due date · Deadline (today/tomorrow/2 days…) · Course (abbreviation, color-coded).**
- Sort by due date by default.
- **[ADDED]** deadline colored by urgency (overdue = red, today/tomorrow = amber, etc.).

### 8.4 Tasks
A list of standalone tasks the user creates. Columns: **Task name · Due date · Deadline.**
- Create/edit/delete tasks.
- Filter control: **This week / This month / All** (extensible).
- Inline complete toggle.

### 8.5 Calendar
A full calendar with a **mode toggle**:
- **Assignments mode:** pulls every assignment from every course onto one calendar, color-coded by course.
- **Lecture schedule mode:** renders recurring `ClassMeeting` times (week view fits best here), color-coded by course.
- Month and week views; clicking an event shows details / jumps to the course.

### 8.6 Study
- **Pomodoro timer** with three modes: **Focus**, **Short break**, **Long break** (configurable lengths in Settings; sensible defaults 25/5/15). Start/pause/reset; auto-advance optional. **[ADDED]** optional desktop notification + soft sound on phase end.
- **Music control:** see §9 for the realistic MVP vs later phases.
- **[ADDED, optional]** log finished focus sessions to `StudySession`.

### 8.7 Fast entry — Quick Add & Day-One Setup  **[ADDED / PRIORITIZED]**
Getting assignments in must be painless — this is a priority, not a nice-to-have. Two complementary flows:

- **Quick Add (global):** a persistent "＋" plus a keyboard shortcut (e.g. Ctrl/⌘-N) reachable from any screen. Opens a tiny form — course, type, name, due date — to add one assignment or task in a few keystrokes, then it lands in the right place. **Confirmed for v1.**
- **Day-One Setup (batch add):** the syllabus-day flow. Inside a course, a **spreadsheet-style entry grid** where each row is an assignment (name · type dropdown · due date · status). Keyboard-driven — `Enter` adds a row, `Tab` moves between fields — so a whole semester for one class goes in within a couple of minutes. One "Save all" writes them together. **In v1.**
  - *Evolution path (later, not v1):* a "paste from syllabus" box that parses pasted lines into editable rows, and eventually **AI-assisted parsing** (paste syllabus text → suggested assignments → user reviews/edits before anything is saved). Manual-first is intentional and correct: automatic date/type extraction is error-prone, so the user stays fully in control until the AI path is reliable and review-gated.

## 9. Music Integration (read this — it's the trickiest feature)

Owning real playback is heavier than it looks and depends on the user's subscription:
- **Spotify:** full play/pause/skip and now-playing requires the Web Playback SDK **+ a Spotify Premium account + OAuth**. Doable inside Electron (it's Chromium), but it's real work and excludes free-tier users.
- **Apple Music:** MusicKit JS can embed and control playback with the user's Apple Music subscription (also token/OAuth flow).

**Recommended phasing:**
- **MVP (Phase 1):** an embedded **Spotify playlist/now-playing widget** (Spotify Embed iframe) + an "Open in Spotify" deep link. Zero auth, works for everyone, looks good next to the timer.
- **Phase 2:** full OAuth + Web Playback SDK control (Spotify) and/or MusicKit (Apple Music), gated on the user connecting an account.

## 10. Scope & Phasing

**MVP (v1, desktop):** §8.1–8.5 fully; §8.6 Pomodoro + music *embed*; local SQLite; light theme; installers for Win/Mac.

**v1.1:** dark mode; desktop reminders for upcoming due dates; "paste from syllabus" parsing to speed up Day-One Setup.

**Later (not committed):**
- Full music playback control (Phase 2 above).
- Cloud sync + accounts (enables phone). Likely approach: a small backend (Postgres + an auth provider) or a local-first sync engine; switch the data layer behind the IPC boundary so the UI barely changes.
- Mobile/tablet apps (see note below).
- LMS import (iCal feed / Canvas API) to auto-populate assignments.
- AI-assisted syllabus parsing (paste syllabus → suggested assignments → user reviews/edits before saving). Deliberately deferred; manual entry stays the safe default until it's reliable and review-gated.

**Mobile note:** v1 stays Electron/web. When mobile becomes real, two paths: (a) **React Native** reuses your TS logic and data shapes, some component rework; (b) re-evaluate **Flutter/Tauri** if you'd rather one codebase for everything. Keeping business logic and types separate from Electron-specific code now makes either path easier.

## 11. Decisions & Open Questions

**Resolved**
- **Assignment "type":** fixed list (see §7).
- **Business logic** lives in `shared/` (platform-agnostic, unit-testable).
- **Fast entry:** Quick Add + Day-One batch grid in v1 (§8.7); AI syllabus parsing deliberately deferred.
- **Project intent:** this is a learning project — see `CLAUDE.md` → "Learning mode."
- **Status model (June 2026):** simplified to **done / not-done** in the UI — one click toggles, instantly discoverable. The DB schema keeps the 3-state enum so legacy `in_progress` rows render as not-done and the decision is trivially reversible.
- **Course Detail calendar (June 2026):** dropped in favor of the class-schedule column — see the amendment note in §8.2.

**Open**
1. **Stack:** proceeding with **Electron + React** unless near-term mobile makes Flutter preferable — confirm before scaffolding.
2. **Music MVP:** embed-only for v1 (recommended) vs full OAuth playback now.
3. **Semester/term:** keep the `Term` concept in v1, or add it later?
