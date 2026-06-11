---
target: study
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-10T19-12-05Z
slug: src-renderer-features-study-studypage-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Timer silently freezes when you navigate away; no off-screen running indicator |
| 2 | Match System / Real World | 4 | "Focus / Break / Pomodoro", technique descriptions — excellent plain language |
| 3 | User Control and Freedom | 3 | Start/pause/reset, phase + technique switch, auto-advance optional |
| 4 | Consistency and Standards | 2 | Two selection languages (black pills vs white segmented tabs); selection deviates from amber system |
| 5 | Error Prevention | 3 | Switching technique mid-session silently resets the running timer |
| 6 | Recognition Rather Than Recall | 3 | Hover-only remove (X) on focus items; low-contrast incomplete checkbox |
| 7 | Flexibility and Efficiency | 2 | No spacebar/keyboard start-pause; running state not in document.title |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and clean, but the timer card stacks 5-6 control groups |
| 9 | Error Recovery | 3 | Low-stakes; music-panel errors delegated out |
| 10 | Help and Documentation | 3 | Technique descriptions are genuinely useful inline help |
| **Total** | | **28/40** | **Good (low end)** |

## Anti-Patterns Verdict

**LLM assessment:** Does NOT look AI-generated. The technique presets with real explanatory copy (52/17 "based on research into top performers", Deep Work "ultradian rhythm"), the phase-colored progress ring, and the focus list that writes completion back to the DB all show genuine product thinking. The only mild tells: the uppercase "Technique" eyebrow and the inconsistent selection styling between control groups.

**Deterministic scan:** Clean — 0 findings.

**Visual overlays:** Not available. Study renders only inside Electron and depends on `window.api` + timer/music state; a plain localhost browser shows an empty/error shell. Review was source-based + detector.

## Overall Impression

This is the most thoughtfully-designed screen in the app — the technique presets, the calm ring, and the focus-list-that-updates-real-data are excellent. But it has one defining flaw that undercuts its entire reason to exist: **the timer only runs while you're staring at it.** Fix that and the contrast, and this is a genuinely lovely focus tool.

## What's Working

1. **Technique presets with real teaching.** Pomodoro / 52-17 / Deep Work / Custom, each with a one-line rationale. This lowers decision load *and* teaches — exactly the calm, helpful brand voice. Far better than a bare timer.
2. **The focus list is a real feature, not a widget.** Pulling assignments/tasks into "what I'm working on today" and having the checkbox write `status` back through React Query is cohesive and genuinely useful. The dashed-border empty state invites the first add.
3. **Calm, legible timer.** The phase-colored progress ring (focus red `#b85050`, break green `#528c66`) + big `tabular-nums` countdown reads instantly and stays calm.

## Priority Issues

- **[P1] The timer freezes when you leave the Study page.** The `setInterval` is mounted in `StudyPage` (`:291–295`); navigating away unmounts it and `clearInterval` stops the countdown, while `isRunning` stays `true`. A student who starts a 25-min focus block and switches to check an assignment comes back to a frozen clock. `tick()` also decrements per-second instead of deriving from an end-timestamp, so it drifts when the OS throttles background timers (lid closed, app backgrounded).
  - **Why it matters:** The entire promise of a focus timer is "start it and go do your work." This breaks that promise — it's the screen's reason to exist.
  - **Fix:** Hoist the interval to a top-level driver (`Layout` or a global hook) so it runs app-wide; store an `endsAt` timestamp in the timer store and derive `timeLeft = endsAt - Date.now()`. Optionally reflect the countdown in `document.title`. *(Also flagged in `REVIEW.md`.)*
  - **Suggested command:** `/impeccable harden`

- **[P1] Muted text and the incomplete-checkbox fail WCAG AA.** Same systemic pattern as the dashboard: `text-stone-400` (~2.5:1) on the technique description, "X of Y done", labels, and custom-duration labels; `text-stone-300` (~1.5:1) on the empty-state secondary line (`:165`) and the incomplete-task `Circle` icon (`:183`, non-text 3:1 fail). The Start/Pause **button label on the green break color** (`#528c66`) is white at ~3.9:1, under AA.
  - **Why it matters:** You set AA in PRODUCT.md; this is the focus screen used in dim rooms during long sessions.
  - **Fix:** Lift muted text to `stone-500`/`600`; darken the incomplete circle; deepen the break phase color (or darken its button text) to clear 4.5:1.
  - **Suggested command:** `/impeccable audit` then `/impeccable polish`

- **[P2] Two selection languages, and selection ignores the amber system.** Technique pills and custom-duration pills use a near-black `bg-stone-800` fill when selected; the phase tabs use the white segmented-control pattern used elsewhere in the app. Within one card that's two visual grammars for "selected" — and neither is the amber that DESIGN.md's One Lamp Rule reserves for the active/selected state.
  - **Why it matters:** Inconsistent selection cues make the control panel feel assembled from parts; it's the screen's biggest "feel" issue after the timer.
  - **Fix:** Pick one selection treatment. Either make all three use the segmented white-on-surface pattern, or use a single amber-based selected state consistently.
  - **Suggested command:** `/impeccable layout`

- **[P2] No keyboard control of the timer.** Spacebar is the universal start/pause for any timer; there's none here, nor any keyboard shortcut. Combined with the freeze bug, there's also no off-screen indicator (e.g. `document.title`) of a running session.
  - **Why it matters:** Power users expect Space; it's a cheap, high-value accelerator.
  - **Fix:** Bind Space (and maybe `R` to reset) when the Study screen is active; reflect running state in the title.
  - **Suggested command:** `/impeccable harden`

- **[P2] Hover-only, keyboard-invisible remove on focus items.** The `X` remove button is `opacity-0 group-hover:opacity-100` (`:215–221`) — same pattern we just fixed on the dashboard star. Invisible to keyboard and touch.
  - **Fix:** Reveal on `group-focus-within`/`focus-visible`; add `aria-label`.
  - **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Maya (Stressed Sophomore — project persona):** Starts a 25-min Pomodoro, switches to the Courses tab to open her reading, comes back — the timer hasn't moved. She loses trust in the one feature meant to keep her honest. This is the single worst experience in the app for her.

**Alex (Power User):** No spacebar to start/pause; must mouse to the button every time. No way to see the timer while working on another screen. The auto-advance toggle is a nice touch, but the lack of keyboard control is grating.

**Sam (Accessibility):** Muted text below AA across the card; incomplete-task circle is `stone-300` (~1.5:1, and color is the only "not done" signal until you read the strikethrough). Phase change announces nothing to a screen reader (though the chime + OS notification help). Start/pause has a clear text label — good.

## Minor Observations

- Switching technique mid-session silently resets a running timer — a brief "this will reset your timer" affordance, or applying only on next phase, would prevent lost focus blocks.
- `activeTechnique = TECHNIQUES.find(...)!` uses a non-null assertion (lint warns on these elsewhere).
- Auto-advance defaults off; for Pomodoro flow many users expect it on — worth considering as the default.
- The `<div className="w-[42px]" />` spacer to center the Start button is a layout hack; a 3-column grid or `justify-between` with real elements would be cleaner.

## Questions to Consider

- Should a running timer live in the app shell (persistent mini-indicator) so it survives navigation and is always glanceable?
- Does the timer card try to do too much at once (technique + phase + ring + controls + auto-advance + custom)? Could technique selection collapse once chosen?
- What happens to a running session when the app is fully quit and reopened — should it persist, or is that out of scope?
