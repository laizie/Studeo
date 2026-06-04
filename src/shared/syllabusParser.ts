import type { AssignmentType } from './types';

export interface ParsedRow {
  name: string;
  type: AssignmentType;
  dueDate: string; // YYYY-MM-DD, or '' if no date was found
}

// ── Month lookup ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTHS).join('|');

// ── Type inference ────────────────────────────────────────────────────────────

function inferType(text: string): AssignmentType {
  const t = text.toLowerCase();
  if (/\bmidterm\b/.test(t))                          return 'Exam';
  if (/\bfinal\s+exam\b/.test(t))                     return 'Exam';
  if (/\bfinal\s+project\b/.test(t))                  return 'Project';
  if (/\bfinal\b/.test(t))                            return 'Exam';
  if (/\b(exam|test)\b/.test(t))                      return 'Exam';
  if (/\bquiz\b/.test(t))                             return 'Quiz';
  if (/\b(hw\b|homework|problem\s+set|pset)\b/.test(t)) return 'Homework';
  if (/\bproject\b/.test(t))                          return 'Project';
  if (/\blab\b/.test(t))                              return 'Lab';
  if (/\b(paper|essay|report)\b/.test(t))             return 'Paper';
  if (/\breading\b/.test(t))                          return 'Reading';
  return 'Assignment';
}

// ── Date extraction ───────────────────────────────────────────────────────────

function padded(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(month: number, day: number, year: number): string {
  return `${year}-${padded(month)}-${padded(day)}`;
}

interface Extracted {
  dueDate: string;
  remaining: string;
}

function extractDate(line: string, fallbackYear: number): Extracted {
  // Pattern 1: "Month Day[st/nd/rd/th][, Year]"
  // Also handles leading "due:" prefix: "due January 15"
  const re1 = new RegExp(
    `(?:due[\\s:]+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{4}))?`,
    'i',
  );

  let m = line.match(re1);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day   = parseInt(m[2]);
    const year  = m[3] ? parseInt(m[3]) : fallbackYear;
    if (month && day >= 1 && day <= 31) {
      return { dueDate: toISO(month, day, year), remaining: line.replace(m[0], '') };
    }
  }

  // Pattern 2: "MM/DD" or "MM/DD/YY" or "MM/DD/YYYY"
  // Also handles "due: 1/15"
  const re2 = /(?:due[:\s]+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;
  m = line.match(re2);
  if (m) {
    const month = parseInt(m[1]);
    const day   = parseInt(m[2]);
    const rawYr = m[3] ? parseInt(m[3]) : fallbackYear;
    const year  = rawYr < 100 ? 2000 + rawYr : rawYr;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { dueDate: toISO(month, day, year), remaining: line.replace(m[0], '') };
    }
  }

  return { dueDate: '', remaining: line };
}

// ── Name cleanup ─────────────────────────────────────────────────────────────

function cleanName(raw: string): string {
  return raw
    .replace(/\bdue(?:\s+date)?\b/gi, '')   // remove leftover "due" / "due date"
    .replace(/^[\s\-–—:•·*#()[\]]+/, '')  // strip leading punctuation
    .replace(/[\s\-–—:•·*#()[\]]+$/, '')  // strip trailing punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse a block of syllabus text into a list of assignment rows.
 *
 * Each non-empty line is treated as a potential assignment. Date patterns
 * (e.g. "Jan 15", "2/14", "March 1st") are extracted and removed; the
 * remainder becomes the assignment name. Lines with no recognisable date
 * still produce a row with an empty dueDate so the user can fill it in.
 *
 * @param text        Raw syllabus text (newline-separated)
 * @param fallbackYear Year to assume when no year is present in the date
 */
export function parseSyllabus(text: string, fallbackYear = new Date().getFullYear()): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const results: ParsedRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip lines that are clearly just section headers or page numbers
    if (line.length < 3)             continue;
    if (/^[\d\s\-–—]+$/.test(line)) continue; // pure numbers / dashes

    const { dueDate, remaining } = extractDate(line, fallbackYear);
    const name = cleanName(remaining || line);

    if (!name) continue;

    results.push({ name, type: inferType(name), dueDate });
  }

  return results;
}
