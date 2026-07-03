import { app, Tray, Menu, nativeImage } from 'electron';
import type { MenuItemConstructorOptions, NativeImage } from 'electron';
import path from 'node:path';
import { listClassMeetings } from './db/repositories/classMeetingRepo';
import { listCourses } from './db/repositories/courseRepo';
import { listMeetingExceptions } from './db/repositories/meetingExceptionRepo';
import { buildExceptionIndex } from '../shared/meetingExceptions';
import {
  findUpcomingClasses,
  formatTrayTitle,
  formatTrayCountdown,
  formatClassLine,
  formatClock12,
  type UpcomingClass,
} from '../shared/upNext';

// The "Up next" menu-bar (macOS) / system-tray (Windows) item. Shows the next
// class and how long until it, so you can glance at it without opening the app.
//
// Data comes straight from the DB in the main process — no renderer involved.
// Like the reminder scheduler, it re-reads on a 30s poll rather than reacting to
// mutations: cheap, and it self-heals across sleep/wake and picks up edits made
// in the app within half a minute.

let tray: Tray | null = null;
let interval: NodeJS.Timeout | null = null;
// Replaced in initTray() with the real "show the main window" callback.
let showWindow: () => void = () => undefined;

const REFRESH_MS = 30_000;

export function initTray(onOpen: () => void): void {
  if (tray) return;
  showWindow = onOpen;

  tray = new Tray(buildTrayImage());
  tray.setToolTip('Studeo');
  // Windows fires 'click' on a left click — open the app. (On macOS a click just
  // opens the context menu, which is the platform norm for menu-bar items.)
  tray.on('click', () => showWindow());

  refreshTray();
  interval = setInterval(refreshTray, REFRESH_MS);
}

/** Recompute the title/tooltip/menu from current data. Safe to call any time. */
export function refreshTray(): void {
  if (!tray) return;

  const now = new Date();
  const upcoming = findUpcomingClasses(
    listClassMeetings(),
    buildExceptionIndex(listMeetingExceptions()),
    listCourses(),
    now,
  );
  const next = upcoming[0] ?? null;

  // macOS shows text next to the icon; a leading space sets it off from the
  // neighbouring item. Windows has no title text, so the tooltip carries it.
  if (process.platform === 'darwin') {
    tray.setTitle(next ? ` ${formatTrayTitle(next, now)}` : ' Studeo');
  }
  tray.setToolTip(next ? trayTooltip(next, now) : 'No upcoming classes');
  tray.setContextMenu(buildMenu(upcoming, now));
}

export function destroyTray(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  tray?.destroy();
  tray = null;
}

// ── Internals ───────────────────────────────────────────────────────────────

function buildTrayImage(): NativeImage {
  if (process.platform === 'darwin') {
    // Text-only menu-bar item: an empty image plus setTitle(). Nothing to ship,
    // and the text adapts to light/dark menu bars automatically.
    return nativeImage.createEmpty();
  }
  // Windows/Linux need a visible icon (there's no title text there). The PNG is
  // copied into the bundle via forge's extraResource, so it resolves in packaged
  // builds too.
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'assets', 'icon.png');
  return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
}

function trayTooltip(next: UpcomingClass, now: Date): string {
  const lead = next.inProgress ? 'In class now' : `Next class in ${formatTrayCountdown(next, now)}`;
  return `${lead} — ${formatClassLine(next)}`;
}

function buildMenu(upcoming: UpcomingClass[], now: Date): Menu {
  const items: MenuItemConstructorOptions[] = [];
  const next = upcoming[0];

  if (next) {
    items.push({
      label: next.inProgress
        ? `In class now — ${next.course?.abbreviation ?? 'Class'}`
        : `Up next — ${next.course?.abbreviation ?? 'Class'} in ${formatTrayCountdown(next, now)}`,
      enabled: false,
    });
    items.push({ label: formatClassLine(next), enabled: false });

    // The rest of today's classes, as glanceable info rows.
    const todayStr = ymdLocal(now);
    const laterToday = upcoming.slice(1).filter(u => u.date === todayStr).slice(0, 3);
    if (laterToday.length > 0) {
      items.push({ type: 'separator' });
      items.push({ label: 'Later today', enabled: false });
      for (const u of laterToday) {
        const where = u.location ? ` · ${u.location}` : '';
        items.push({
          label: `   ${formatClock12(u.startTime)} · ${u.course?.abbreviation ?? 'Class'}${where}`,
          enabled: false,
        });
      }
    }
  } else {
    items.push({ label: 'No upcoming classes', enabled: false });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'Open Studeo', click: () => showWindow() });
  items.push({ label: 'Quit Studeo', role: 'quit' });

  return Menu.buildFromTemplate(items);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
