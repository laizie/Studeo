# Ideas backlog

Deferred feature ideas — discussed and parked, not scheduled. When picking one
up, follow the recipe in `CLAUDE.md` ("How to add a new feature/screen").

## Notes (deferred June 2026 — revisit later)

### 1. Surface assignment notes in rows
Assignments already have a `notes` column (`shared/types.ts` → `Assignment.notes`),
but the text is only visible inside the edit dialog (`AddAssignmentDialog.tsx`).
Idea: a small note indicator icon on `AssignmentRow` that expands the note text
inline (or shows it on hover), so notes like "ch. 4–6, submit on Canvas" are
useful at a glance. No data-model change needed — pure UI.

### 2. Per-course notes page
One freeform autosaved notes area per course (syllabus policies, office hours,
Canvas links). Implementation sketch:
- Migration: add nullable `notes TEXT` column to `courses`.
- Plain textarea (or light markdown) on `CourseDetailPage`, autosaved with a
  debounce through the normal update IPC path.
- Deliberately **not** a Notion-style block/page system — that's a different
  product and would swallow months. One textarea per course is the whole scope.
