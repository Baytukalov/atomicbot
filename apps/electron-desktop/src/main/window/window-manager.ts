import type { BrowserWindow } from "electron";
import type { AppState } from "../app-state";
import { createMainWindow } from "./mainWindow";
import { getWindowIconPath } from "../tray";

/**
 * Returns the existing main window or creates a new one.
 * The optional `onNewWindow` callback fires only when a fresh window is
 * created — use it to replay state (e.g. gateway status) to the renderer.
 */
export async function ensureMainWindow(
  state: AppState,
  mainDir: string,
  onNewWindow?: (win: BrowserWindow) => void
): Promise<BrowserWindow | null> {
  const win = state.mainWindow;
  if (win && !win.isDestroyed()) {
    return win;
  }

  if (!state.preloadPath || !state.rendererIndex) {
    return null;
  }

  const nextWin = await createMainWindow({
    preloadPath: state.preloadPath,
    rendererIndex: state.rendererIndex,
    iconPath: getWindowIconPath(mainDir),
  });
  state.mainWindow = nextWin;

  nextWin.on("closed", () => {
    if (state.mainWindow === nextWin) {
      state.mainWindow = null;
    }
  });

  onNewWindow?.(nextWin);
  return nextWin;
}

export async function showMainWindow(
  state: AppState,
  mainDir: string,
  onNewWindow?: (win: BrowserWindow) => void
): Promise<void> {
  const win = await ensureMainWindow(state, mainDir, onNewWindow);
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}
