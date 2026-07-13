---
name: Studeo
description: A calm, warm-espresso desktop home for a student's whole semester.
colors:
  lamplight-amber: "#e2a53b"
  amber-deep: "#d49530"
  amber-ink: "#1e1208"
  cream-bg: "#f9f5f0"
  espresso-ink: "#292524"
  stone-body: "#44403c"
  stone-muted: "#a8a29e"
  surface-white: "#ffffff"
  sand-border: "#e8ddd0"
  sand-border-strong: "#d4c8b8"
  espresso-sidebar: "#2c1f14"
  espresso-divider: "#3d2b1f"
  tan-muted: "#c4a882"
  cream-text: "#e8d5c0"
  task-violet: "#7c6abf"
  dark-bg: "#332211"
  dark-surface: "#553311"
  dark-surface-hi: "#664433"
  dark-border: "#442918"
  dark-text: "#f0e0cc"
  dark-muted: "#e0b870"
  warm-bg: "#3d2918"
  warm-surface: "#7e5a38"
  warm-surface-hi: "#8e6a48"
  warm-border: "#6e4c30"
  danger-ink: "#b91c1c"
  danger-bg: "#fee2e2"
  warning-ink: "#c2410c"
  warning-bg: "#ffedd5"
  success-ink: "#15803d"
  success-bg: "#dcfce7"
typography:
  page-title:
    fontFamily: "DM Sans, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  card-title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  section-label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.025em"
  stat:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  caption:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  display:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
rounded:
  pill: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.amber-deep}"
    textColor: "{colors.amber-ink}"
  button-ghost:
    textColor: "{colors.stone-body}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  dialog:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  nav-item:
    textColor: "{colors.tan-muted}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
  nav-item-active:
    backgroundColor: "{colors.lamplight-amber}"
    textColor: "{colors.amber-ink}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
  course-pill:
    rounded: "{rounded.pill}"
    padding: "2px 6px"
---

# Design System: Studeo

## 1. Overview

**Creative North Star: "The Warm Desk Lamp"**

Studeo is a dark espresso room with a single amber glow, and light falls only where the work is. The chrome — the sidebar, the divider lines, the muted labels — recedes into warm shadow. The content surface is a clean cream page, and the one accent color, Lamplight Amber, appears exactly where the student should act or look: the primary button, the active nav item, the focus-list star. Everything else is deliberately quiet. The feeling is calm, focused, and intentional: the app should lower a student's stress, not compete for their attention.

The palette is committed to warmth without flooding it. The body is true cream (`#f9f5f0`) and content sits on white cards with hairline sand borders — warmth lives in the espresso sidebar, the amber accent, and the per-course color dots, never in a saturated background wash. Three themes share one identity: a light cream default, a deep-brown `dark` mode, and a mid-brown `warm` mode; all three stay in the same espresso-and-amber family so the brand never breaks. Density is comfortable, not cramped — generous page padding, soft dividers between list rows, and a tight type scale carried entirely by one humanist sans (DM Sans) in three weights.

This system explicitly rejects the **corporate SaaS dashboard** (metric-tile cockpits, enterprise-blue chrome), the **generic gray to-do app** it replaces, **loud gamified productivity** (streaks, confetti, bright competing primaries), and the **cluttered institutional LMS**. Studeo is personal, warm, and scannable — the calm antidote to the school portal.

**Key Characteristics:**
- One accent (Lamplight Amber) used only for action, selection, and state — never decoration.
- Cream content + espresso chrome + amber glow: a committed warm identity, not a tinted-neutral wash.
- Single type family (DM Sans), tight rem scale, hierarchy by weight and size.
- Per-course color is *data*, encoded as dots/pills/strips — it identifies a class, it never floods.
- Flat surfaces with hairline borders and one soft shadow; depth comes from tonal layering.
- Comfortable density with soft `divide-y` row separators; warm and tactile to use.

## 2. Colors

A committed warm-espresso palette: cream and white content surfaces, deep-brown chrome, one amber voice, and a 28-step per-course accent system that carries meaning, not decoration.

### Primary
- **Lamplight Amber** (`#e2a53b`): The single voice color. Primary buttons, the active sidebar nav item, focus-list stars, the "soon" deadline tier, current-time indicators — and the **focus phase** of the timer, on every surface (`PHASE_COLORS.focus`). Focus is the lamp; it is never red. Pressed/hover deepens to **Amber Deep** (`#d49530`). Text *on* amber is always **Amber Ink** (`#1e1208`) — near-black for contrast, never white.

### Neutral — Light (content)
- **Cream BG** (`#f9f5f0`): The application body background. The "page" the work sits on.
- **Surface White** (`#ffffff`): Cards, list containers, dialogs, stat chips. The raised reading surface over cream.
- **Espresso Ink** (`#292524`, Tailwind `stone-800`): Primary body text and headings on light surfaces. The default ink end of the ramp.
- **Stone Body** (`#44403c`, `stone-700`): Secondary text, form values, list-item titles.
- **Stone Muted** (`#a8a29e`, `stone-400`): Meta text, subtitles, timestamps, placeholders. **Use sparingly — never for primary reading text.**
- **Sand Border** (`#e8ddd0`): Hairline borders and `divide-y` row separators on cards. **Sand Border Strong** (`#d4c8b8`) is the hover border.

### Neutral — Chrome (sidebar)
- **Espresso Sidebar** (`#2c1f14`): The persistent left nav background. The "dark room" the lamp sits in.
- **Espresso Divider** (`#3d2b1f`): Sidebar section dividers and inactive-item hover background.
- **Tan Muted** (`#c4a882`): Inactive nav labels and icons on the espresso sidebar.
- **Cream Text** (`#e8d5c0`): The "Studeo" wordmark and hovered nav text on the sidebar.

### Secondary
- **Task Violet** (`#7c6abf`): The standalone-task accent — the task indicator bar and the "show tasks" toggle. Distinguishes course-bound assignments (course color) from free-floating tasks. Carried by the `--task` token (`bg-task`) in classes and `TASK_COLOR` from `lib/colors.ts` in JS style objects.

### Scene palette — Focus Mode
Focus Mode is its own fixed warm-dark room, deliberately outside the theme tokens (they flip bright in the light theme and would wash out the room). Its palette lives in the `ROOM` constant in `FocusMode.tsx` — ink `#f0e0cc`, soft `#d8c5ab`, muted `#a08a6e`, line `#3a2c1e`, well `#160f0a`, card `#1f1710`, done-green `#5fa37a` — plus the backdrop gradient stops (`#241a12 → #160f0a → #0c0806`) and the on-dark phase glows in `GLOW`. These are ratified scene colors, not drift; change them in `ROOM`/`GLOW` only.

### Tertiary — Per-course accents
A fixed 28-color palette (14 hues × normal + pastel) lives in `src/renderer/lib/colors.ts` (`COURSE_COLORS`). Each course owns one. It appears as: a 2px top strip on dashboard cards, a 10px dot, the abbreviation pill (course color text on a 25%-alpha tint of itself, `${color}40`), and the progress-bar fill. **Never hardcode these hexes elsewhere — import from `colors.ts`.**

### Semantic — Deadline urgency
Deadline badges map urgency to a warm→cool ramp (text / tint): **overdue & today** danger red (`#b91c1c` / `#fee2e2`), **tomorrow** orange (`#c2410c` / `#ffedd5`), **soon** amber (`#e2a53b` / amber-100), **this week & later** green (`#15803d` / `#dcfce7`). Honest, not alarmist — color reinforces the word, it doesn't replace it.

### Dark & Warm themes
`dark` mode is the North Star scene taken literally — a near-neutral roasted espresso (Gruvbox-style low chroma) where the warmth lives in the cream text and the amber lamp, never in saturated brown surfaces: bg `#211a13`, surfaces `#2c241b`/`#3a3128`, borders `#423627`, text `#f0e0cc`, muted `#c9b594`. `warm` mode stays the committed mid-brown identity, pitched one notch deeper so cream text clears AA: bg `#3d2918`, surfaces `#6a4b2f`/`#7a5a3c`, borders `#5c4128`, with a soft gold muted (`#ecca8a`). Both keep Lamplight Amber unchanged. Switched via `.dark` class and `html[data-theme="warm"]` (warm applies `.dark` plus variable overrides).

### Named Rules
**The Token Rule.** Every theme-dependent color is a CSS variable defined once in `src/index.css` (`--bg`, `--surface`, `--surface-hi`, `--inset`, `--line`, `--ink`, `--ink-soft`, `--muted`, `--accent`, `--accent-deep`, `--accent-ink`) and consumed as a Tailwind utility (`bg-surface`, `border-line`, `text-ink`, `text-muted`, `bg-accent`…). The variables switch values under `.dark` and `html[data-theme="warm"]`, so a component writes **one class, never a light/dark/warm hex trio**. Writing an inline theme hex in a component is prohibited — add or reuse a token. The theme-*invariant* chrome has tokens too (`--sidebar`, `--sidebar-line`, `--sidebar-hover`, `--sidebar-muted`, `--sidebar-ink`, `--task` → `bg-sidebar`, `text-sidebar-muted`, `bg-task`, …) so even constant colors are written once.

**The One Lamp Rule.** Lamplight Amber appears only where the user should act, what is currently selected, or a live state indicator. If amber is on screen as decoration, it is wrong. Its rarity is what makes it read as "look here."

**The Color-Is-Data Rule.** Per-course colors encode *which class* and nothing else. They appear as dots, pills, the 2px card top-strip, and the **leading identity bar** — a ≤6px vertical bar at the head of a row or page header (the task-violet bar on task rows, the course bar on the Course Detail header). Never a card background, never a full-width fill, and never a bar *and* a dot on the same element (one identity cue per element). Status and urgency get their own semantic ramp; course color never doubles as either.

## 3. Typography

**Body & Display Font:** DM Sans (with `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
**Weights loaded:** 400 (regular), 500 (medium), 600 (semibold)

**Character:** A single humanist geometric sans carries the entire interface — headings, labels, buttons, data. DM Sans is friendly and slightly rounded without being soft or playful; it reads calm and legible at small sizes, which is the whole job in a dense planner. No second family, no display face: hierarchy comes from weight and size, never from a typeface change.

### Hierarchy
- **Page Title** (600, `1.5rem` / text-2xl, lh 1.25): The one h1 per screen ("Good morning", "This Week"). Always `espresso-ink` / `dark-text`. Pair with a `stone-muted` subtitle one line below.
- **Card Title** (600, `1rem` / text-base, lh ~1.375): Course names, dialog headings, section card titles. Truncates with ellipsis rather than wrapping in tight columns.
- **Stat** (600, `1.5rem`, `tabular-nums`): The big number in stat chips. Tabular figures so digits don't jitter as counts change.
- **Body** (400, `0.875rem` / text-sm, lh 1.5): The default — list-row text, assignment names, descriptions. `stone-body` on light. Prose blocks cap at 65–75ch.
- **Label** (500, `0.75rem` / text-xs): Form labels, meta, pill text, deadline badges. Form labels use `stone-body`; meta uses `stone-muted`.
- **Section Label** (600, `0.75rem`, uppercase, `tracking-wide` 0.025em): List-group headers inside cards ("Overdue", "Due this week", day dividers). The one place uppercase tracking is allowed — it labels *data groups*, not brand sections.
- **Caption** (500, `0.6875rem` / `text-caption`): The smallest step — dense metadata only: music-player track meta, heatmap and timeline axis labels, service badges. One value; the drifted 0.6rem/10px/11px/0.7rem fragments are retired. Never body or label text.
- **Display** (600, `3.25rem` / `text-display`, tabular-nums): The timer hero numerals. The one step above Stat; nothing else uses it.

### Named Rules
**The One Family Rule.** DM Sans does every job. Introducing a second typeface — especially a display or serif face for "personality" — breaks the calm and is prohibited. Personality comes from weight, spacing, and the amber accent.

**The Tabular Numbers Rule.** Any number that updates in place (counts, progress %, stat chips, timers) uses `tabular-nums`. Misaligned digits read as a bug in a tracking app.

## 4. Elevation

Studeo is **flat by default with one soft shadow and tonal layering**. Depth is communicated primarily by *tone*, not shadow: the espresso sidebar is a dark layer, cream is the body, white cards are the raised reading layer. Borders (`sand-border` hairlines) do most of the separation work; shadows are a quiet secondary cue.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)`, Tailwind `shadow-sm`): The standing state of every card, stat chip, and list container. Barely-there lift off the cream.
- **Hover** (`shadow-md`): Only interactive cards (dashboard course cards) raise on hover, paired with a border shift to `sand-border-strong`. Signals "this is clickable."
- **Dialog** (`shadow-2xl`): Modals over the `bg-black/30` scrim. The one place a heavy shadow is correct — it lifts the dialog clearly above the dimmed app.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest with at most `shadow-sm`. A stronger shadow is a *response to state* (hover on a clickable card, a modal lifting over the scrim) — never ambient decoration. If a static, non-interactive element has `shadow-md` or heavier, it's wrong.

## 5. Components

Components are **warm and tactile**: gentle radii, hairline sand borders, the amber accent reserved for the primary action. Same vocabulary on every screen.

### Buttons
- **Shape:** Gently rounded (`rounded-lg`, 8px). Compact padding (`8px 16px` / px-4 py-2; `8px 12px` for toolbar buttons).
- **Primary:** `lamplight-amber` background, `amber-ink` text. Hover deepens to `amber-deep`. Disabled: `opacity-50` + `cursor-not-allowed`. This is the single loudest element on any screen — at most one per view.
- **Ghost / Cancel:** No background. `stone-body` text → `espresso-ink` on hover. Used for the secondary action beside a primary (dialog "Cancel").
- **Transition:** `transition-colors`, ~150ms. No transform on press.

### Inputs / Fields
- **Style:** `surface-white` background, `1px stone-300` border (`#d6d3d1`), `rounded-lg`, `8px 12px` padding, `text-sm`. Placeholder is `stone-muted` (`#a8a29e`).
- **Focus:** `focus:ring-2 ring-stone-400` with `border-transparent` — a calm gray ring, not amber. The shared `INPUT_CLASS` constant carries dark/warm overrides; reuse it, don't re-spell inputs.
- **Select / textarea:** Same treatment as text inputs for a consistent control vocabulary.

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px) for cards and list containers; `rounded-2xl` (16px) for dialogs.
- **Background:** `surface-white` on light (`dark-surface`/`warm-surface` in themes).
- **Border:** `1px sand-border` (`#e8ddd0`); interactive cards shift to `sand-border-strong` on hover.
- **Shadow:** `shadow-sm` at rest (see Elevation).
- **Internal padding:** `20px` (p-5) for content cards, `24px` (p-6) for dialogs. List rows inside containers use `px-3 py-2` with `divide-y divide-sand-border` separators — no nested cards.

### Course Pill & Dot
- **Pill:** The course abbreviation. Background is the course color at 25% alpha (`${color}40`), text is the full course color. `rounded` (4px), `2px 6px`, `text-xs font-semibold`. Verify text contrast for pastel course colors.
- **Dot:** A `10px` (`w-2.5 h-2.5`) `rounded-full` swatch in the course color, leading a list row.
- **Accent strip:** A `2px` full-width bar in the course color across the top of dashboard cards (this is the *only* sanctioned colored strip — see Don'ts).

### Deadline / Urgency Badge
- **Style:** `text-xs font-medium`, `rounded` (4px), `px-2 py-0.5`. Text + tint pair from the semantic urgency ramp (§2). Always sits beside the human deadline word ("Today", "2 days") — never standalone color.

### Navigation (Sidebar)
- **Container:** Fixed `w-56`, full-height, `espresso-sidebar` background. Wordmark + Quick-Add (`⌘N`) at top, music mini-player and Settings pinned at bottom.
- **Item:** `rounded-lg`, `6px 10px`, `text-sm`, 15px Lucide icon + label. **Default:** `tan-muted` text. **Hover:** `espresso-divider` background, `cream-text` text. **Active:** `lamplight-amber` background, `amber-ink` text, `font-semibold`.

### Toggle & Tab Switcher
- **Toggle switch:** `h-4 w-7 rounded-full` track, white knob, `task-violet` when on (used for the Tasks toggle). 200ms slide.
- **Tab switcher (segmented):** A `stone-100` pill container, `rounded-lg`, holding `rounded-md` buttons. Active tab gets `surface-white` + `shadow-sm` + `font-medium`; inactive is muted with a hover tint.

### Progress Bar
- **Style:** `h-1.5 rounded-full` track in `stone-100`; fill in the course color, `transition-all duration-300`. Paired with a `done / total` count and `%`, both `tabular-nums`.

### Empty States
- Centered, generous vertical padding (`py-16`–`py-24`). One `stone-muted` line of plain, encouraging copy ("No courses yet. Add your first one to get started." / "Nothing due this week — enjoy the break!") plus one quiet underlined text-button to the primary action. Never a bare "nothing here."

### Loading States
- Skeletons, not spinners: `animate-pulse` `stone-100` blocks matching the real layout's shape. Spinners in the middle of content are prohibited.

## 6. Do's and Don'ts

### Do:
- **Do** keep Lamplight Amber (`#e2a53b`) to one job per screen — the primary action or the active selection. Text on amber is always Amber Ink (`#1e1208`).
- **Do** keep body text at the ink end of the ramp (`espresso-ink` / `stone-body`). The warm cream background makes muted browns the single likeliest contrast failure — hold body text to ≥4.5:1.
- **Do** import every per-course color from `src/renderer/lib/colors.ts`. Never hardcode a course hex in a component.
- **Do** carry one identity across all three themes (light / `dark` / `warm`) — same amber, same structure, only the browns shift.
- **Do** use skeletons (`animate-pulse`) for loading and a friendly, encouraging empty state with a primary action on every screen.
- **Do** use `tabular-nums` on every number that updates in place (counts, %, timers, stat chips).
- **Do** reuse the shared `INPUT_CLASS` and existing row/card patterns instead of re-spelling Tailwind strings.
- **Do** use the token utilities (`bg-surface`, `border-line`, `text-ink`, `text-muted`, `bg-accent`) for any theme-dependent color — see The Token Rule. New colors are added to the token block in `src/index.css`, never as inline hexes.

### Don't:
- **Don't** build a **corporate SaaS dashboard** — no metric-tile cockpit, no enterprise-blue chrome, no charts-for-decoration. Studeo answers "what's due / what now?", it is not a BI tool.
- **Don't** let it read as a **generic gray to-do app** — that's the thing students are upgrading from. Keep the warmth and considered hierarchy.
- **Don't** add **loud or gamified** flourishes: no streaks, confetti, badges, or bright competing primaries. The app lowers stimulation.
- **Don't** recreate a **cluttered institutional LMS** — keep it scannable, calm, and personal.
- **Don't** flood any surface with a course color or use it as a card background. Color is data: dots, pills, the 2px card top-strip, and the ≤6px leading identity bar (see The Color-Is-Data Rule). Decorative `border-left`/`border-right` side-stripes on cards and callouts remain prohibited.
- **Don't** introduce a second typeface or a display/serif face. DM Sans does every job; hierarchy is weight and size.
- **Don't** use amber for input focus rings, decorative borders, or large fills — focus rings are the calm gray `ring-stone-400`.
- **Don't** ship gradient text, decorative glassmorphism, a hero-metric template, or spinners-in-content.
- **Don't** put `shadow-md`+ on static, non-interactive elements. Heavy shadow is a response to state (hover, modal) only.
