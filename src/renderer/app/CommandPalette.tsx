import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, FileText, LayoutDashboard, BookOpen, CalendarDays, CheckSquare,
  Calendar, Timer, Settings, ClipboardCheck, Plus, Maximize2, CircleDot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNotes, useSearchNotes } from '../lib/queries/useNotes';
import { useCourses } from '../lib/queries/useCourses';
import { useAssignments } from '../lib/queries/useAssignments';
import { useFocusStore } from '../store/useFocusStore';
import { courseInk, coursePillBg } from '../lib/colors';
import { formatDueDate } from '../../shared/deadlines';
import { cn } from '../lib/utils';
import type { Assignment, Course, Note } from '../../shared/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the Quick Add dialog (lives beside the palette in Layout). */
  onQuickAdd: () => void;
}

// ── Result model ──────────────────────────────────────────────────────────────
// One flat list the arrow keys walk over; `group` renders the section headers.

type PaletteItem =
  | { group: 'Screens';     key: string; kind: 'screen';     label: string; to: string; icon: LucideIcon }
  | { group: 'Courses';     key: string; kind: 'course';     course: Course }
  | { group: 'Assignments'; key: string; kind: 'assignment'; assignment: Assignment; course?: Course }
  | { group: 'Notes';       key: string; kind: 'note';       note: Note }
  | { group: 'Actions';     key: string; kind: 'action';     label: string; hint?: string; icon: LucideIcon; run: () => void };

const SCREENS: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Dashboard',     to: '/',          icon: LayoutDashboard },
  { label: 'Courses',       to: '/courses',   icon: BookOpen },
  { label: 'This Week',     to: '/this-week', icon: CalendarDays },
  { label: 'Weekly Review', to: '/review',    icon: ClipboardCheck },
  { label: 'Tasks',         to: '/tasks',     icon: CheckSquare },
  { label: 'Notes',         to: '/notes',     icon: FileText },
  { label: 'Calendar',      to: '/calendar',  icon: Calendar },
  { label: 'Study',         to: '/study',     icon: Timer },
  { label: 'Settings',      to: '/settings',  icon: Settings },
];

// Shorthand students actually type. Expanded before matching so "hw" finds a
// Homework and "proj" finds a Project — the fields themselves stay untouched.
const ALIASES: Record<string, string> = {
  hw: 'homework',
  hwk: 'homework',
  proj: 'project',
  midterm: 'exam',
  final: 'exam',
};

/**
 * Multi-token match: every word in the query must appear *somewhere* across the
 * item's searchable fields. The old version tested each field separately with a
 * single substring, so "phys hw" found nothing for Physics → Homework 3 — no one
 * field held both words, which is exactly how a power user types.
 */
function matches(needle: string, ...fields: (string | undefined | null)[]): boolean {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(token => hay.includes(ALIASES[token] ?? token));
}

function noteSnippet(note: Note): string {
  const text = note.content_text.trim().replace(/\n+/g, ' ');
  return text.length > 80 ? text.slice(0, 80).trimEnd() + '…' : text;
}

/**
 * ⌘K palette — the app-wide jump. Searches screens, courses, assignments, and
 * notes (FTS), plus a couple of quick actions. Courses/assignments are matched
 * in-memory: React Query already holds them all locally, so no extra IPC.
 */
export default function CommandPalette({ isOpen, onClose, onQuickAdd }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const trimmed = query.trim();

  const { data: courses = [] }     = useCourses();
  const { data: assignments = [] } = useAssignments();
  const recentNotes = useNotes();
  const noteSearch  = useSearchNotes(trimmed);

  const courseMap = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);

  const items = useMemo((): PaletteItem[] => {
    const out: PaletteItem[] = [];

    const screens = trimmed ? SCREENS.filter(s => matches(trimmed, s.label)) : SCREENS;
    for (const s of screens) {
      out.push({ group: 'Screens', key: `s-${s.to}`, kind: 'screen', ...s });
    }

    const courseHits = (trimmed
      ? courses.filter(c => matches(trimmed, c.name, c.abbreviation))
      : courses
    ).slice(0, 5);
    for (const c of courseHits) {
      out.push({ group: 'Courses', key: `c-${c.id}`, kind: 'course', course: c });
    }

    // Assignments only appear once the user types — the full list is noise.
    if (trimmed) {
      const hits = assignments
        .filter(a => {
          const course = courseMap.get(a.course_id);
          // Name + type + course, searched as one string: "phys hw" and
          // "hw physics" both land on Physics → Homework 3.
          return matches(trimmed, a.name, a.type, course?.abbreviation, course?.name);
        })
        // Open work first, then soonest due date.
        .sort((a, b) => {
          const doneA = a.status === 'completed' ? 1 : 0;
          const doneB = b.status === 'completed' ? 1 : 0;
          if (doneA !== doneB) return doneA - doneB;
          return a.due_date.localeCompare(b.due_date);
        })
        .slice(0, 6);
      for (const a of hits) {
        out.push({ group: 'Assignments', key: `a-${a.id}`, kind: 'assignment', assignment: a, course: courseMap.get(a.course_id) });
      }
    }

    const notes = ((trimmed ? noteSearch.data : recentNotes.data) ?? []).slice(0, 5);
    for (const n of notes) {
      out.push({ group: 'Notes', key: `n-${n.id}`, kind: 'note', note: n });
    }

    const actions: { label: string; hint?: string; icon: LucideIcon; run: () => void }[] = [
      { label: 'Quick add…',      hint: '⌘N', icon: Plus,      run: onQuickAdd },
      { label: 'Enter Focus Mode',            icon: Maximize2, run: () => useFocusStore.getState().open() },
    ];
    for (const a of actions) {
      if (trimmed && !matches(trimmed, a.label)) continue;
      out.push({ group: 'Actions', key: `x-${a.label}`, kind: 'action', ...a });
    }

    return out;
  }, [trimmed, courses, assignments, courseMap, noteSearch.data, recentNotes.data, onQuickAdd]);

  // Reset and focus on open; return focus to the trigger on close (same
  // contract as the dialogs); keep the highlighted row in range as results change.
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
      return () => previousFocus.current?.focus();
    }
  }, [isOpen]);
  useEffect(() => setIndex(0), [query]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#palette-item-${index}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!isOpen) return null;

  function pick(item: PaletteItem) {
    onClose();
    switch (item.kind) {
      case 'screen':     navigate(item.to); break;
      case 'course':     navigate(`/courses/${item.course.id}`); break;
      case 'assignment':
        // You typed the assignment's name — land with its editor open, not at
        // the top of a course list you'd have to re-search.
        navigate(`/courses/${item.assignment.course_id}`, {
          state: { editAssignmentId: item.assignment.id },
        });
        break;
      case 'note':       navigate(`/notes/${item.note.id}`); break;
      case 'action':     item.run(); break;
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[index]) pick(items[index]);
    } else if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Tab') {
      // Combobox pattern: focus stays on the input; options are reached with
      // the arrow keys. Without this, Tab walks out into the page behind.
      e.preventDefault();
    }
  }

  // ── Row renderers ────────────────────────────────────────────────────────────

  function rowContent(item: PaletteItem) {
    switch (item.kind) {
      case 'screen': {
        const Icon = item.icon;
        return (
          <>
            <Icon size={15} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate text-sm font-medium text-ink">{item.label}</span>
          </>
        );
      }
      case 'course':
        return (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.course.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.course.name}</span>
            <span className="shrink-0 text-xs text-muted">{item.course.abbreviation}</span>
          </>
        );
      case 'assignment': {
        const done = item.assignment.status === 'completed';
        return (
          <>
            {item.course ? (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: coursePillBg(item.course.color), color: courseInk(item.course.color) }}
              >
                {item.course.abbreviation}
              </span>
            ) : (
              <CircleDot size={15} className="shrink-0 text-muted" aria-hidden="true" />
            )}
            <span className={cn('min-w-0 flex-1 truncate text-sm', done ? 'text-muted line-through' : 'font-medium text-ink')}>
              {item.assignment.name}
            </span>
            <span className="shrink-0 text-xs text-muted">{formatDueDate(item.assignment.due_date)}</span>
          </>
        );
      }
      case 'note':
        return (
          <>
            <FileText size={15} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{item.note.title || 'Untitled'}</span>
              {noteSnippet(item.note) && (
                <span className="block truncate text-xs text-muted">{noteSnippet(item.note)}</span>
              )}
            </span>
          </>
        );
      case 'action': {
        const Icon = item.icon;
        return (
          <>
            <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="flex-1 truncate text-sm font-medium text-ink">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs text-muted">{item.hint}</span>}
          </>
        );
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[16vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-lg mx-4 overflow-hidden rounded-2xl bg-surface shadow-2xl animate-pop"
      >
        <div className="relative border-b border-line">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search courses, assignments, notes…"
            aria-label="Search the app"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
            aria-controls="palette-list"
            aria-activedescendant={items[index] ? `palette-item-${index}` : undefined}
            className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>

        <div ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              {trimmed ? `Nothing matches “${trimmed}”.` : 'Nothing here yet.'}
            </p>
          ) : (
            items.map((item, i) => (
              <div key={item.key}>
                {(i === 0 || items[i - 1].group !== item.group) && (
                  <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                    {item.group === 'Notes' && !trimmed ? 'Recent notes' : item.group}
                  </p>
                )}
                <button
                  id={`palette-item-${i}`}
                  role="option"
                  aria-selected={i === index}
                  tabIndex={-1}
                  onClick={() => pick(item)}
                  onMouseEnter={() => setIndex(i)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    i === index ? 'bg-surface-hi' : 'hover:bg-surface-hi',
                  )}
                >
                  {rowContent(item)}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-xs text-muted">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
