import { describe, it, expect } from 'vitest';
import { parseQuickAdd, type QuickParseCourse } from '../quickParse';

// Reference "today": Wednesday, September 9 2026 (day-of-week 3).
const NOW = new Date(2026, 8, 9, 10, 0);

const COURSES: QuickParseCourse[] = [
  { id: 'phys', name: 'Physics 252', abbreviation: 'PHYS' },
  { id: 'math', name: 'Linear Algebra', abbreviation: 'MATH' },
  { id: 'bio',  name: 'Biology',      abbreviation: 'BIO'  },
];

const parse = (s: string) => parseQuickAdd(s, COURSES, NOW);

// ── The headline example ──────────────────────────────────────────────────────

describe('parseQuickAdd — "phys quiz 2 fri"', () => {
  it('resolves course, type, date, and cleans the name', () => {
    const r = parse('phys quiz 2 fri');
    expect(r.courseId).toBe('phys');
    expect(r.type).toBe('Quiz');
    expect(r.dueDate).toBe('2026-09-11'); // the coming Friday
    expect(r.name).toBe('Quiz 2');
  });
});

// ── Relative dates ────────────────────────────────────────────────────────────

describe('relative dates', () => {
  it('today / tonight → the reference day', () => {
    expect(parse('essay today').dueDate).toBe('2026-09-09');
    expect(parse('essay tonight').dueDate).toBe('2026-09-09');
  });

  it('tomorrow and its abbreviations → +1 day', () => {
    expect(parse('hw tomorrow').dueDate).toBe('2026-09-10');
    expect(parse('hw tmrw').dueDate).toBe('2026-09-10');
    expect(parse('hw tmr').dueDate).toBe('2026-09-10');
  });

  it('a bare weekday is the soonest upcoming (today counts)', () => {
    expect(parse('quiz mon').dueDate).toBe('2026-09-14'); // next Monday
    expect(parse('quiz wed').dueDate).toBe('2026-09-09'); // today is Wednesday
    expect(parse('quiz fri').dueDate).toBe('2026-09-11');
  });

  it('"next <weekday>" jumps to the following week', () => {
    expect(parse('exam next mon').dueDate).toBe('2026-09-21');
    expect(parse('exam next wed').dueDate).toBe('2026-09-16');
  });

  it('accepts full weekday names and thurs/tues variants', () => {
    expect(parse('lab thursday').dueDate).toBe('2026-09-10');
    expect(parse('lab tues').dueDate).toBe('2026-09-15');
  });

  it('"in N days"', () => {
    expect(parse('paper in 3 days').dueDate).toBe('2026-09-12');
  });
});

// ── Explicit dates ────────────────────────────────────────────────────────────

describe('explicit dates', () => {
  it('month name + day, rolling the year forward when already past', () => {
    expect(parse('final jan 15').dueDate).toBe('2027-01-15'); // Jan already gone → next year
    expect(parse('project dec 5').dueDate).toBe('2026-12-05'); // Dec still ahead
  });

  it('honors an explicit 4-digit year', () => {
    expect(parse('reading march 3 2026').dueDate).toBe('2026-03-03');
  });

  it('numeric M/D with year roll-forward', () => {
    expect(parse('hw 2/14').dueDate).toBe('2027-02-14');
    expect(parse('hw 10/2').dueDate).toBe('2026-10-02');
  });

  it('numeric M/D/YY', () => {
    expect(parse('quiz 1/20/27').dueDate).toBe('2027-01-20');
  });
});

// ── Course resolution ─────────────────────────────────────────────────────────

describe('course resolution', () => {
  it('matches an exact abbreviation', () => {
    expect(parse('bio lab fri').courseId).toBe('bio');
  });

  it('matches a name-word prefix ("phys" → Physics)', () => {
    expect(parse('phys reading').courseId).toBe('phys');
  });

  it('returns null when nothing matches', () => {
    expect(parse('quiz fri').courseId).toBeNull();
  });

  it('never eats a type keyword as a course token', () => {
    // "lab" is reserved; only "bio" should resolve the course.
    const r = parse('bio lab 3 fri');
    expect(r.courseId).toBe('bio');
    expect(r.type).toBe('Lab');
    expect(r.name).toBe('Lab 3');
  });
});

// ── Type inference on the leftover ────────────────────────────────────────────

describe('type inference', () => {
  it('keeps the type word in the name while inferring the type', () => {
    const r = parse('math midterm mon');
    expect(r.courseId).toBe('math');
    expect(r.type).toBe('Exam');
    expect(r.name).toBe('Midterm');
    expect(r.dueDate).toBe('2026-09-14');
  });

  it('falls back to Assignment when no keyword is present', () => {
    const r = parse('phys chapter 3 notes fri');
    expect(r.type).toBe('Assignment');
    expect(r.name).toBe('Chapter 3 notes');
  });
});

// ── Cleanup & edge cases ──────────────────────────────────────────────────────

describe('cleanup and edges', () => {
  it('capitalizes the first character of the saved name', () => {
    expect(parse('quiz 2 fri').name).toBe('Quiz 2');
  });

  it('reports the matched tokens for UI highlighting', () => {
    const r = parse('phys quiz 2 fri');
    expect(r.courseToken).toBe('phys');
    expect(r.dateToken).toBe('fri');
  });

  it('handles a line with no date or course', () => {
    const r = parse('read chapter 5');
    expect(r.courseId).toBeNull();
    expect(r.dueDate).toBeNull();
    expect(r.name).toBe('Read chapter 5');
  });

  it('an empty input yields an empty, dateless result', () => {
    const r = parse('   ');
    expect(r).toEqual({
      name: '', type: 'Assignment', courseId: null, courseToken: null, dueDate: null, dateToken: null,
    });
  });

  it('does not mistake weekday substrings inside words for dates', () => {
    // "monday" would match, but "money"/"satisfy" must not.
    expect(parse('money essay').dueDate).toBeNull();
    expect(parse('satisfy the rubric').dueDate).toBeNull();
  });
});
