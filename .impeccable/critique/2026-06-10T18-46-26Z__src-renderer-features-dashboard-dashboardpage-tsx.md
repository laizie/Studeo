---
target: dashboard
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-10T18-46-26Z
slug: src-renderer-features-dashboard-dashboardpage-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good loading skeletons + counts; no error state on failed queries |
| 2 | Match System / Real World | 4 | Plain, warm language ("enjoy the break!"); greeting + date |
| 3 | User Control and Freedom | 3 | Navigational page; semester filter, dialog has Esc/Cancel |
| 4 | Consistency and Standards | 3 | Stat-chip number format inconsistent (4/9 vs bare int); uppercase label on every section |
| 5 | Error Prevention | 3 | Create dialog validates; dashboard itself low-risk |
| 6 | Recognition Rather Than Recall | 3 | Focus-list star is opacity-0 until hover — hidden affordance |
| 7 | Flexibility and Efficiency | 3 | ⌘N Quick Add, focus list, term auto-select — solid |
| 8 | Aesthetic and Minimalist Design | 2 | 4-tile metric row is the SaaS-dashboard cliché and duplicates section counts |
| 9 | Error Recovery | 2 | Query error renders as the "No courses yet" empty state — misleading; generic error copy |
| 10 | Help and Documentation | 2 | None; empty states teach a little |
| **Total** | | **28/40** | **Good (low end)** |

## Anti-Patterns Verdict

**LLM assessment:** Does NOT look obviously AI-generated. The warm-espresso identity, the "overdue → this week → tasks" IA, and the genuinely friendly empty-state copy give it a point of view most generations lack. The one real slop tell is the **four equal stat tiles** at the top — big number + small label, repeated four times — which is the SaaS hero-metric / identical-tile-grid template, and the exact "corporate SaaS dashboard" pattern PRODUCT.md names as an anti-reference. A secondary, milder tell: the uppercase tracked Section Label appears on all five sections.

**Deterministic scan:** 1 warning — `gray-on-color` at DashboardPage.tsx:94. Partial false positive on the exact pairing (detector matched `text-stone-500` against `bg-red-100` across a ternary; the live pairing is stone-500 on stone-100). But it corroborates the dominant review finding: muted text is too light.

**Visual overlays:** Not available. The dashboard renders only inside Electron and depends on `window.api` IPC data, so a plain localhost browser shows an empty/error shell. Review was source-based + detector.

## Overall Impression

This is a calm, considered dashboard that mostly delivers on "what's due / what now?" in under five seconds — overdue surfaces first, the language is warm, and every section has a real empty/loading state. Two things hold it back: muted text that quietly fails the AA bar you set, and a top metric row that both leans on the anti-reference and repeats numbers already shown directly below it. The single biggest opportunity: **fix the muted-text contrast and rethink the stat row**, and this jumps from "good" to "genuinely polished."

## What's Working

1. **The IA answers the core question.** Overdue first (red, only when present), then due-this-week, then tasks — the page is ordered by urgency, exactly the PRODUCT.md "answer fast" principle. Today's classes + course list on the right is the right secondary tier.
2. **States are handled, not skipped.** A layout-matching `animate-pulse` skeleton, and encouraging empty copy ("Nothing due this week — enjoy the break!", "Add assignments to a course to see them here"). This is the calm, kind voice the brand asks for.
3. **Restraint with the accent.** Amber appears once as the primary action ("Add course"); the focus-star is the only other amber. That honors the One Lamp Rule.

## Priority Issues

- **[P1] Muted text fails the AA contrast bar.** `text-stone-300` (#d6d3d1) is used for empty hints ("No assignments yet", "No pending tasks", "No classes today") — roughly 1.5:1 on white, effectively invisible. `text-stone-400` (#a8a29e) carries subtitles, meta, and the date — ~2.6:1, under the 4.5:1 you targeted. On the cream body it's even closer. This is the single most common AI-design readability failure and it's pervasive here.
  - **Why it matters:** You set WCAG AA in PRODUCT.md. Tired students in low light (the literal North Star scene) can't read the secondary information, which is most of the dashboard.
  - **Fix:** Never use stone-300 for text. Move meta/subtitle text to stone-500 (#78716c, ~4.6:1) at minimum, stone-600 for anything important. Verify the dark/warm muted tokens (#cc9a58, #e0b870) too.
  - **Suggested command:** `/impeccable audit`

- **[P1] The four-tile stat row is the SaaS cliché — and redundant.** "assignments done / overdue / due this week / tasks remaining" are four identical metric tiles, the exact corporate-dashboard pattern PRODUCT.md rejects. Worse, three of the four numbers are repeated immediately below in the section labels (Overdue count, Due this week count, Tasks count).
  - **Why it matters:** It's visual duplication that adds extraneous cognitive load and pulls the page toward the anti-reference, undercutting the calm, personal feel.
  - **Fix:** Cut the row to what earns its place — keep the single "overdue" alarm chip *only when overdue > 0*, or replace the whole row with one quiet summary sentence ("4 of 9 done · 2 overdue"). Let each section own its own count.
  - **Suggested command:** `/impeccable distill`

- **[P2] Query errors masquerade as the empty state.** If `useCourses`/`useAssignments` error, `isLoading` is false and `hasCourses` is false, so the page renders "No courses yet. Add your first one" — telling a returning student their data is gone.
  - **Why it matters:** A transient DB/IPC hiccup looks like data loss. Alarming for a tool holding their whole semester.
  - **Fix:** Branch on `isError` with a distinct "Couldn't load your dashboard — retry" state, separate from the genuine empty state.
  - **Suggested command:** `/impeccable harden`

- **[P2] Hidden + nested interactive affordance.** The focus-list star is `opacity-0 group-hover:opacity-100` (invisible until mouse hover; keyboard users never see it) and it's a `<button>` nested inside the row's `<a>` Link — invalid/again-a11y nesting.
  - **Why it matters:** Keyboard and screen-reader users (Sam) can't discover or cleanly operate it; mobile/touch has no hover to reveal it.
  - **Fix:** Reveal on `group-focus-within`/`focus-visible` too, and restructure so the action isn't a button inside an anchor (stretched-link pattern, or row as div + explicit link).
  - **Suggested command:** `/impeccable harden`

- **[P3] Small consistency tells.** Stat chips mix "4 / 9" with bare integers in otherwise-identical tiles; the uppercase tracked Section Label rides above all five sections. Both are minor but read as slightly templated.
  - **Suggested command:** `/impeccable layout`

## Persona Red Flags

**Alex (Power User):** ⌘N Quick Add is a real win. But the focus-list star is mouse-hover-only — Alex never sees the one power feature on the page without hunting. No keyboard affordance to add to the focus list from the dashboard.

**Sam (Accessibility):** Multiple contrast failures (stone-300 empty hints ~1.5:1, stone-400 meta ~2.6:1) under the AA bar. The hover-reveal star is invisible to keyboard users and is a button nested in an anchor (breaks expected tab semantics). Urgency *is* paired with text labels, so color-alone is OK there — good.

**Maya (Stressed Sophomore — project persona):** Opens Studeo between classes to answer "what's due?" The urgency-ordered list serves her well. But the muted secondary text is hard to read on a phone-bright screen in a sunlit hallway, and the redundant stat row makes the page feel busier than the calm it promises.

## Minor Observations

- The right column is a fixed 240px; on the `lg` breakpoint the "Courses" list duplicates the dedicated Courses page — fine for glanceability, but consider whether it earns the space vs. "today's classes."
- `StatChip` urgent variant (red) is good; the non-urgent chips would benefit from less visual weight so the urgent one stands out more.
- Tabular-nums is correctly applied on the stat numbers and course counts — good attention to detail.

## Questions to Consider

- If you deleted the stat row entirely, what would the page lose that the section headers don't already say?
- What does this dashboard look like the morning of finals week with 12 overdue items — does "calm" still hold, or does it need a density mode?
- Should the focus-list star be a persistent, quiet icon rather than a hover surprise?
