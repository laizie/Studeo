// Natural-language Quick Add parser.
//
// Turns a single typed line like  "phys quiz 2 fri"  into structured fields:
//   { courseId: <Physics>, type: 'Quiz', dueDate: '2026-09-11', name: 'Quiz 2' }
//
// Pure logic (no Electron/Node, no React) so it's trivially unit-testable — the
// UI just calls parseQuickAdd() on every keystroke and shows a live preview.
//
// The pipeline is deliberately ordered:  date → course → type → name.
// Each stage pulls its token OUT of the line, so by the time we infer the type
// and keep the leftover as the name, the date/course words are already gone.

import type { AssignmentType } from './types';
import { inferType, MONTHS } from './syllabusParser';

export interface QuickParseCourse {
  id: string;
  name: string;
  abbreviation: string;
}

export interface QuickParseResult {
  /** Cleaned assignment name (date + course words removed). */
  name: string;
  /** Inferred from the leftover text via the shared inferType(). */
  type: AssignmentType;
  /** Resolved course id, or null when nothing matched. */
  courseId: string | null;
  /** The word that matched a course (for highlighting), or null. */
  courseToken: string | null;
  /** Resolved due date YYYY-MM-DD, or null when no date word was found. */
  dueDate: string | null;
  /** The phrase that matched a date ("fri", "next mon", "jan 15"), or null. */
  dateToken: string | null;
}

// ── Weekday lookup ────────────────────────────────────────────────────────────

// Name/abbreviation → day-of-week index (0 = Sunday … 6 = Saturday).
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};
const WEEKDAY_PATTERN = Object.keys(WEEKDAYS).join('|');

// Type keywords that must never be mistaken for a course token — otherwise
// "lab" or "quiz" could get eaten as a course name and lose the type.
const RESERVED = new Set([
  'assignment', 'hw', 'homework', 'pset', 'problem', 'set',
  'quiz', 'exam', 'test', 'midterm', 'final',
  'project', 'lab', 'paper', 'essay', 'report', 'reading',
]);

// ── Small date helpers (local time, never UTC) ────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Format a Date using its LOCAL components. Using toISOString() here would emit
// the UTC date, which is already "tomorrow" during evening hours west of UTC.
function toISOLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A new local-midnight date `days` after `now`.
function addDays(now: Date, days: number): string {
  return toISOLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

// Days from `nowDow` forward to the next `target` weekday. Today counts as 0, so
// "fri" said on a Friday means today.
function daysUntilWeekday(nowDow: number, target: number): number {
  return (target - nowDow + 7) % 7;
}

// For a bare "jan 15" with no year: assume the NEXT occurrence. If Jan 15 has
// already passed this year, roll to next year.
function rollYear(now: Date, month: number, day: number): number {
  const year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const today = new Date(year, now.getMonth(), now.getDate());
  return candidate < today ? year + 1 : year;
}

// ── Date matching ─────────────────────────────────────────────────────────────

interface DateHit { dueDate: string; token: string; }

/**
 * Find the first date expression in `text`. Order matters: the more specific
 * patterns ("next friday") are tried before the looser ones ("friday").
 */
function matchDate(text: string, now: Date): DateHit | null {
  const lower = text.toLowerCase();

  // today / tonight / tomorrow
  let m = lower.match(/\b(today|tonight|tomorrow|tmrw|tmr)\b/);
  if (m) {
    const days = m[1] === 'tomorrow' || m[1] === 'tmrw' || m[1] === 'tmr' ? 1 : 0;
    return { dueDate: addDays(now, days), token: m[0] };
  }

  // next <weekday>  → the following week's weekday (this-coming + 7)
  m = lower.match(new RegExp(`\\bnext\\s+(${WEEKDAY_PATTERN})\\b`));
  if (m) {
    const days = daysUntilWeekday(now.getDay(), WEEKDAYS[m[1]]) + 7;
    return { dueDate: addDays(now, days), token: m[0] };
  }

  // (this) <weekday>  → the soonest upcoming, today counts
  m = lower.match(new RegExp(`\\b(?:this\\s+)?(${WEEKDAY_PATTERN})\\b`));
  if (m) {
    const days = daysUntilWeekday(now.getDay(), WEEKDAYS[m[1]]);
    return { dueDate: addDays(now, days), token: m[0] };
  }

  // in N days
  m = lower.match(/\bin\s+(\d{1,3})\s+days?\b/);
  if (m) {
    return { dueDate: addDays(now, parseInt(m[1], 10)), token: m[0] };
  }

  // month name + day  ("jan 15", "march 3rd", "dec 5 2026")
  const monthPattern = Object.keys(MONTHS).join('|');
  m = lower.match(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (m) {
    const month = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    if (month && day >= 1 && day <= 31) {
      const year = m[3] ? parseInt(m[3], 10) : rollYear(now, month, day);
      return { dueDate: `${year}-${pad(month)}-${pad(day)}`, token: m[0] };
    }
  }

  // numeric M/D or M/D/YY(YY)
  m = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = m[3]
        ? (parseInt(m[3], 10) < 100 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10))
        : rollYear(now, month, day);
      return { dueDate: `${year}-${pad(month)}-${pad(day)}`, token: m[0] };
    }
  }

  return null;
}

// ── Course matching ───────────────────────────────────────────────────────────

// Strip to comparable letters/digits: "PHY-252" → "phy252".
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// How strongly a single token identifies a course. 0 = no match.
function scoreCourse(tok: string, c: QuickParseCourse): number {
  const abbr = normalize(c.abbreviation);
  if (abbr && tok === abbr) return 100;                            // "cs" == "CS"
  if (abbr.length >= 2 && tok.startsWith(abbr)) return 80;         // "phys252" ⊃ "PHYS"
  if (abbr.length >= 2 && tok.length >= 3 && abbr.startsWith(tok)) return 75; // "phys" ⊂ "PHYS252"

  let nameScore = 0;
  for (const word of c.name.split(/\s+/)) {
    const nw = normalize(word);
    if (!nw) continue;
    if (tok === nw) nameScore = Math.max(nameScore, 60);           // "biology" == name word
    else if (tok.length >= 3 && nw.startsWith(tok)) nameScore = Math.max(nameScore, 50); // "phys" ⊂ "physics"
  }
  return nameScore;
}

interface CourseHit { courseId: string; token: string; }

// Pick the best-scoring (token, course) pair across the line. Reserved type
// words are never treated as course tokens.
function matchCourse(text: string, courses: QuickParseCourse[]): CourseHit | null {
  let best: { courseId: string; token: string; score: number } | null = null;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const tok = normalize(raw);
    if (tok.length < 2 || RESERVED.has(tok)) continue;
    for (const c of courses) {
      const score = scoreCourse(tok, c);
      if (score > 0 && (!best || score > best.score)) {
        best = { courseId: c.id, token: raw, score };
      }
    }
  }
  return best ? { courseId: best.courseId, token: best.token } : null;
}

// ── Name cleanup ──────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// Remove the first (case-insensitive) occurrence of a matched token from the line.
function removeToken(text: string, token: string): string {
  return text.replace(new RegExp(escapeRegExp(token), 'i'), ' ');
}

function cleanName(raw: string): string {
  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:•·*#,]+/, '')
    .replace(/[\s\-–—:•·*#,]+$/, '')
    .trim();
  // Light polish: capitalize the first character so "quiz 2" saves as "Quiz 2".
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a natural-language Quick Add line into structured assignment fields.
 *
 * @param input   The raw line the user typed.
 * @param courses Candidate courses to resolve an abbreviation/name against.
 * @param now     Reference "today" (injected for testability; defaults to real now).
 */
export function parseQuickAdd(
  input: string,
  courses: QuickParseCourse[],
  now: Date = new Date(),
): QuickParseResult {
  let remaining = input.trim();

  const dateHit = matchDate(remaining, now);
  if (dateHit) remaining = removeToken(remaining, dateHit.token);

  const courseHit = matchCourse(remaining, courses);
  if (courseHit) remaining = removeToken(remaining, courseHit.token);

  // Type comes from what's left — the date/course words can't skew it now.
  const type = inferType(remaining);

  return {
    name: cleanName(remaining),
    type,
    courseId: courseHit?.courseId ?? null,
    courseToken: courseHit?.token ?? null,
    dueDate: dateHit?.dueDate ?? null,
    dateToken: dateHit?.token ?? null,
  };
}
