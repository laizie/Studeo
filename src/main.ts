import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { initDb } from './main/db/connection';
import { registerCourseHandlers } from './main/ipc/registerCourseHandlers';
import { registerAssignmentHandlers } from './main/ipc/registerAssignmentHandlers';
import { registerTaskHandlers } from './main/ipc/registerTaskHandlers';
import { registerClassMeetingHandlers } from './main/ipc/registerClassMeetingHandlers';
import { registerTermHandlers } from './main/ipc/registerTermHandlers';

if (started) {
  app.quit();
}

// Register all IPC handlers before the window opens so they're ready to respond
// to the renderer the moment it loads. Handlers are cheap to register — they just
// add listeners, they don't do any DB work yet.
function registerIpcHandlers(): void {
  registerCourseHandlers();
  registerAssignmentHandlers();
  registerTaskHandlers();
  registerClassMeetingHandlers();
  registerTermHandlers();
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
  // Required on Windows so toasts appear under the app name in the Action Center.
  // On macOS this is a no-op (macOS uses the CFBundleName from the plist instead).
  app.setAppUserModelId(app.getName());

  // Auto-approve the Notification permission request that the renderer fires on
  // StudyPage mount. Without this handler, Electron's default is to grant it
  // anyway in most versions, but being explicit guarantees it on every platform.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  // DB must be open before any IPC handler can touch it, so init first.
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
