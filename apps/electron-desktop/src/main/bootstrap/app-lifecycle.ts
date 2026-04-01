import { app, type BrowserWindow } from "electron";
import * as path from "node:path";

import type { AppState } from "../app-state";
import type { Platform } from "../platform";

type ShowWindow = () => Promise<void>;
type HandleDeepLink = (url: string, win: BrowserWindow | null) => void;

export function registerProtocolHandler(protocol: string): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1]!)]);
    }
    return;
  }
  app.setAsDefaultProtocolClient(protocol);
}

export function registerAppLifecycle(params: {
  protocol: string;
  state: AppState;
  platform: Platform;
  showWindow: ShowWindow;
  handleDeepLink: HandleDeepLink;
  disposeAutoUpdater: () => void;
  stopGatewayChild: () => Promise<void>;
  stopLlamacppServer: () => Promise<void>;
  removeGatewayPid: (stateDir: string) => void;
}): boolean {
  const {
    protocol,
    state,
    platform,
    showWindow,
    handleDeepLink,
    disposeAutoUpdater,
    stopGatewayChild,
    stopLlamacppServer,
    removeGatewayPid,
  } = params;

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url, state.mainWindow);
  });

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return false;
  }

  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${protocol}://`));
    if (url) {
      handleDeepLink(url, state.mainWindow);
    }
    void showWindow();
  });

  app.on("window-all-closed", () => {
    if (!platform.keepAliveOnAllWindowsClosed) {
      app.quit();
    }
  });

  app.on("activate", () => {
    void showWindow();
  });

  process.on("exit", () => {
    if (state.gatewayPid) {
      try {
        platform.killProcessTree(state.gatewayPid);
      } catch {
        // Already dead — nothing to do.
      }
      state.gatewayPid = null;
    }
  });

  app.on("before-quit", (event) => {
    if (state.isQuitting) {
      return;
    }
    state.isQuitting = true;
    event.preventDefault();

    disposeAutoUpdater();
    Promise.all([stopGatewayChild(), stopLlamacppServer()])
      .then(() => {
        if (state.gatewayStateDir) {
          removeGatewayPid(state.gatewayStateDir);
        }
      })
      .finally(() => {
        app.quit();
      });
  });

  return true;
}
