import { app, BrowserWindow, session, protocol } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDb } from './main/db/connection';
import { registerCourseHandlers } from './main/ipc/registerCourseHandlers';
import { registerAssignmentHandlers } from './main/ipc/registerAssignmentHandlers';
import { registerTaskHandlers } from './main/ipc/registerTaskHandlers';
import { registerSubtaskHandlers } from './main/ipc/registerSubtaskHandlers';
import { registerClassMeetingHandlers } from './main/ipc/registerClassMeetingHandlers';
import { registerMeetingExceptionHandlers } from './main/ipc/registerMeetingExceptionHandlers';
import { registerTermHandlers } from './main/ipc/registerTermHandlers';
import { registerStudySessionHandlers } from './main/ipc/registerStudySessionHandlers';
import { registerStudyBlockHandlers } from './main/ipc/registerStudyBlockHandlers';
import { registerNoteHandlers } from './main/ipc/registerNoteHandlers';
import { registerNoteLinkHandlers } from './main/ipc/registerNoteLinkHandlers';
import { registerMediaHandlers } from './main/ipc/registerMediaHandlers';
import { ASSET_SCHEME, registerAssetProtocol } from './main/media';
import { registerReminderHandlers } from './main/ipc/registerReminderHandlers';
import { registerAppHandlers } from './main/ipc/registerAppHandlers';
import { registerFeedHandlers } from './main/ipc/registerFeedHandlers';
import { registerSyllabusHandlers } from './main/ipc/registerSyllabusHandlers';
import { startReminderScheduler } from './main/reminders';
import { registerSpotifyHandlers, notifyAuthCallback } from './main/ipc/registerSpotifyHandlers';
import { registerAppleMusicHandlers } from './main/ipc/registerAppleMusicHandlers';
import { setAuthCompletionHandler } from './main/spotify/spotifyAuth';
import { initAutoUpdater } from './main/updater';

if (started) {
  app.quit();
}

// Must run before app `ready`: mark our custom scheme as a privileged, secure standard
// scheme so the renderer can load studeo-asset:// images like any normal https resource.
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function registerIpcHandlers(): void {
  registerCourseHandlers();
  registerAssignmentHandlers();
  registerTaskHandlers();
  registerSubtaskHandlers();
  registerClassMeetingHandlers();
  registerMeetingExceptionHandlers();
  registerTermHandlers();
  registerStudySessionHandlers();
  registerStudyBlockHandlers();
  registerNoteHandlers();
  registerNoteLinkHandlers();
  registerMediaHandlers();
  registerReminderHandlers();
  registerAppHandlers();
  registerFeedHandlers();
  registerSyllabusHandlers();
  registerSpotifyHandlers();
  registerAppleMusicHandlers();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 900,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload only uses contextBridge + ipcRenderer (both sandbox-safe), and note
      // images load via the studeo-asset:// custom protocol rather than file://, so the
      // renderer can run fully sandboxed — the strongest isolation for untrusted UI.
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
};

app.on('ready', () => {
  app.setAppUserModelId(app.getName());

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  // Wire up the Spotify localhost callback → renderer notification.
  // The localhost server in spotifyAuth.ts calls this when the user returns
  // from Spotify's auth page; we forward the result to the renderer so
  // useSpotifyAuthListener can invalidate the status query immediately.
  setAuthCompletionHandler(notifyAuthCallback);

  initDb();
  registerAssetProtocol(); // serves studeo-asset:// note images from the data folder
  registerIpcHandlers();
  startReminderScheduler(); // after initDb — the scheduler reads class meetings
  createWindow();
  initAutoUpdater(); // checks GitHub for newer published releases (packaged builds only)
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
