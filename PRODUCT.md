# Product

## Register

product

## Users

College students (primary) and high-school students juggling multiple courses across a
semester. They reach for Studeo at a desk or laptop — planning their week, dropping in an
assignment between classes, or settling into a focused study block. They're comfortable
installing a desktop app and want something nicer and calmer than a spreadsheet, a generic
to-do app, or their school's LMS. Single-user, local-first, no login: it's *their* space,
not an institutional portal.

The core job: answer **"what's due soon, and what should I do right now?"** in under five
seconds, and make getting a whole semester's worth of assignments *in* nearly frictionless
(Quick Add + Day-One batch entry).

## Product Purpose

Studeo is a local-first desktop app (Windows + macOS) for tracking courses, assignments,
recurring lecture times, standalone tasks, and study sessions — with a built-in Pomodoro
timer and lightweight music control for focused work. It exists to give students one calm,
trustworthy home for their academic life that lowers semester stress instead of adding to
it.

Success looks like: a student models their term in a couple of minutes on syllabus day, then
returns daily because the Dashboard and This Week views make "what matters now" obvious at a
glance, and the Study mode makes it pleasant to actually sit down and work.

This is also a **learning project** — the maintainer is building it to understand
desktop/web development deeply. Favor clear, conventional, well-explained design decisions
over clever ones; surface tradeoffs rather than hiding them.

## Brand Personality

**Calm · Focused · Cozy.** Studeo should feel like a warm, quiet study space — a coffee-shop
corner, not a control panel. The visual identity is a deliberately **warm espresso palette**:
a cream body (`#f9f5f0`), a deep espresso sidebar (`#2c1f14`), and a single amber accent
(`#e2a53b`), with course colors used sparingly as dots, pills, and thin accents — never as
background floods. Dark and "warm" theme variants stay in the same brown family.

Voice is plain, encouraging, and low-pressure. Empty states invite rather than nag; deadline
language is honest and human ("Overdue", "today", "2 days"). The app should feel like it's on
the student's side. Color carries warmth through accent and typography, not anxiety.

## Anti-references

- **Corporate SaaS dashboards** — dense metric tiles, charts everywhere, enterprise-blue
  chrome, the analytics-cockpit look. Studeo is personal, not a business intelligence tool.
- **Generic to-do apps** — flat, gray, characterless checkbox lists. This is the thing
  students are upgrading *from*; it must feel warmer and more considered.
- **Loud / gamified productivity** — streaks, confetti, badges, bright primary colors
  competing for attention. Studeo lowers stimulation, it doesn't manufacture it.
- **Cluttered institutional LMS** (Canvas, Moodle) — busy, hard to scan, dreaded. Studeo is
  the calm antidote to the school portal.

## Design Principles

- **Answer the question fast.** Every screen earns its place by helping answer "what's due
  and what do I do now?" Hierarchy and scannability beat completeness and density.
- **Calm by default.** Whitespace, soft separators, and one accent color. Restraint is the
  feature; if something competes for attention, it had better deserve it.
- **Color means something.** Amber is the app's voice; each course owns one accent used as a
  dot/pill/thin stripe to encode *which class*, never decoration. No accent without meaning.
- **Low-friction entry is sacred.** Adding assignments and tasks must stay near-instant
  (Quick Add, keyboard-driven batch grid). Friction here is a product failure, not a polish
  item.
- **Honest, encouraging language.** Deadlines and empty states speak plainly and kindly;
  never alarmist, never cute-for-its-own-sake.
- **Clarity over cleverness** (learning project). Conventional, readable patterns the
  maintainer can understand and extend win over slick-but-opaque ones.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**:

- Body text ≥ 4.5:1 contrast against its background; large/bold text ≥ 3:1. Watch the warm
  palette — muted browns on cream are the likeliest failure; keep body text toward the
  espresso ink end (`#292524`), not light tan.
- Full keyboard navigation, including Quick Add (⌘N) and the batch-entry grid (Enter/Tab
  flow). Visible focus indicators on all interactive elements.
- `prefers-reduced-motion` respected — motion is already minimal and fast; provide
  crossfade/instant fallbacks for any reveal or transition.
- Course-accent palette should stay distinguishable for color-blind users; never rely on
  color alone to convey status or which-course (pair with label/abbreviation/icon).
