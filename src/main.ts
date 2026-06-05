import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDb } from './main/db/connection';
import { registerCourseHandlers } from './main/ipc/registerCourseHandlers';
import { registerAssignmentHandlers } from './main/ipc/registerAssignmentHandlers';
import { registerTaskHandlers } from './main/ipc/registerTaskHandlers';
import { registerClassMeetingHandlers } from './main/ipc/registerClassMeetingHandlers';
import { registerTermHandlers } from './main/ipc/registerTermHandlers';
import { registerSpotifyHandlers, notifyAuthCallback } from './main/ipc/registerSpotifyHandlers';
import { registerAppleMusicHandlers } from './main/ipc/registerAppleMusicHandlers';
import { setAuthCompletionHandler } from './main/spotify/spotifyAuth';

if (started) {
  app.quit();
}

function registerIpcHandlers(): void {
  registerCourseHandlers();
  registerAssignmentHandlers();
  registerTaskHandlers();
  registerClassMeetingHandlers();
  registerTermHandlers();
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
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.webContents.openDevTools();
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
  registerIpcHandlers();
  createWindow();
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
