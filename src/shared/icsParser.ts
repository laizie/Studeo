import type { AssignmentType } from './types';
import { inferType } from './syllabusParser';

// A single event parsed out of an iCalendar (.ics) feed — the shape the import
// UI works with. Mirrors ParsedRow in syllabusParser.ts: a pure data record,
// no Electron/Node, fully unit-testable.
export interface ParsedIcsEvent {
  /** The event's stable UID from the feed (used for the "assignment?" heuristic). */
  uid: string;
  /** SUMMARY with any trailing "[Course]" stripped and ICS escapes decoded. */
  title: string;
  /** Text inside the trailing "[ ]" of the SUMMARY, e.g. "CS 101" — null if absent. */
  courseLabel: string | null;
  /** Assignment type inferred from the title (reuses syllabus inference). */
  type: AssignmentType;
  /** Due date as YYYY-MM-DD in LOCAL time, or '' if none could be parsed. */
  dueDate: string;
  /** HH:MM local clock time for display only; null for all-day events. */
  dueTime: string | null;
  /** Canvas tags assignment events with "assignment" in their UID — used to
   *  separate real assignments from generic calendar events. */
  isAssignment: boolean;
}

// ── A parsed property line (NAME;PARAM=val:VALUE) ──────────────────────────────

interface RawProp {
  name: string;                    // uppercased, e.g. "DTSTART"
  params: Record<string, string>;  // uppercased keys, e.g. { VALUE: "DATE" }
  value: string;                   // everything after the unquoted ':'
}

// ── Line unfolding (RFC 5545) ─────────────────────────────────────────────────

/**
 * Calendar feeds wrap long logical lines: a CRLF followed by a single space or
 * tab means "this is a continuation of the previous line". We splice those back
 * together before parsing, then split into logical lines.
 */
function unfoldLines(text: string): string[] {
  const unfolded = text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '');
  return unfolded.split(/\r\n|\n/);
}

// ── Property line parsing ──────────────────────────────────────────────────────

function parsePropLine(line: string): RawProp | null {
  // Split name+params from the value at the first colon that is NOT inside a
  // double-quoted parameter value (e.g. TZID="America/New_York" contains none,
  // but the rule keeps us safe if one ever does).
  let inQuote = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) { colon = i; break; }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);     // NAME;PARAM=val;...
  const value = line.slice(colon + 1);

  const parts = head.split(';');
  const name = parts[0].trim().toUpperCase();

  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq === -1) continue;
    const key = parts[i].slice(0, eq).trim().toUpperCase();
    let val = parts[i].slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[key] = val;
  }
  return { name, params, value };
}

// ── Value helpers ──────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Decode the small set of escapes iCalendar uses inside text values:
 * `\n`→newline, `\,`→",", `\;`→";", `\\`→"\". A single pass keeps escaped
 * backslashes from being mis-handled.
 */
function unescapeText(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === 'n' || next === 'N') { out += '\n'; i++; continue; }
      if (next === ',' || next === ';' || next === '\\') { out += next; i++; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * Turn a DTSTART value into a local YYYY-MM-DD date (+ optional HH:MM time).
 *
 * Three forms appear in the wild:
 *   - "20260115" with VALUE=DATE  → all-day, no clock time.
 *   - "20260116T045900Z"          → a UTC instant; convert to LOCAL date/time.
 *   - "20260115T235900"           → naive/TZID wall-clock; taken as-is.
 *
 * The UTC→local conversion is the important one: an assignment due at 04:59Z is
 * 11:59 PM the *previous* evening in the Americas, so the local calendar date —
 * what a student actually sees as the due date — can differ from the UTC date.
 */
function parseIcsDate(prop: RawProp): { date: string; time: string | null } {
  const raw = prop.value.trim();
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return { date: '', time: null };

  const isDateOnly = prop.params['VALUE'] === 'DATE' || m[4] === undefined;
  if (isDateOnly) {
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
  }

  const hour = Number(m[4]);
  const min  = Number(m[5]);
  const sec  = m[6] ? Number(m[6]) : 0;
  const isUtc = m[7] === 'Z';

  if (isUtc) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, min, sec));
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }

  // Naive or TZID-qualified datetime — best effort: use the wall-clock value.
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/**
 * Canvas formats an assignment SUMMARY as "Title [Course Name]". Pull the
 * trailing bracketed course out so we can group events by course; if there's no
 * bracket, the whole summary is the title and the label is null.
 */
function extractCourseLabel(summary: string): { title: string; courseLabel: string | null } {
  const m = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (m) return { title: m[1].trim(), courseLabel: m[2].trim() };
  return { title: summary.trim(), courseLabel: null };
}

// ── Build one event from its property lines ────────────────────────────────────

function buildEvent(props: RawProp[]): ParsedIcsEvent | null {
  const get = (name: string) => props.find(p => p.name === name);

  const summaryProp = get('SUMMARY');
  const dtstart = get('DTSTART');
  // An event we can use needs at least a title and a start; skip anything else.
  if (!summaryProp || !dtstart) return null;

  const { title, courseLabel } = extractCourseLabel(unescapeText(summaryProp.value));
  if (!title) return null;

  const { date, time } = parseIcsDate(dtstart);
  const uid = get('UID')?.value.trim() ?? '';

  return {
    uid,
    title,
    courseLabel,
    type: inferType(title),
    dueDate: date,
    dueTime: time,
    isAssignment: /assignment/i.test(uid),
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Parse the text of an iCalendar (.ics) feed into a flat list of events.
 *
 * Walks the unfolded lines, collecting the property lines between each
 * BEGIN:VEVENT / END:VEVENT into one event. Wrapper blocks (VCALENDAR,
 * VTIMEZONE) are ignored — we only care about VEVENTs with a summary and date.
 */
export function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = unfoldLines(text);
  const events: ParsedIcsEvent[] = [];

  let current: RawProp[] | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase() === 'BEGIN:VEVENT') { current = []; continue; }
    if (line.toUpperCase() === 'END:VEVENT') {
      if (current) {
        const event = buildEvent(current);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (current) {
      const prop = parsePropLine(line);
      if (prop) current.push(prop);
    }
  }

  return events;
}
