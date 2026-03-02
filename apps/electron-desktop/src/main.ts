import { app, type BrowserWindow } from "electron";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { getPlatform } from "./main/platform";

// Trigger platform init (e.g. spawn patching on Windows) as early as possible.
const platform = getPlatform();
import { registerIpcHandlers } from "./main/ipc/register";
import { registerTerminalIpcHandlers } from "./main/terminal/ipc";
import { DEFAULT_PORT } from "./main/constants";
import { ensureGatewayConfigFile, readGatewayTokenFromConfig } from "./main/gateway/config";
import { runConfigMigrations } from "./main/gateway/config-migrations";
import {
  removeGatewayPid,
  killOrphanedGateway,
  removeStaleGatewayLock,
} from "./main/gateway/pid-file";
import {
  broadcastGatewayState,
  stopGatewayChild,
  createGatewayStarter,
} from "./main/gateway/lifecycle";
import { initAutoUpdater, disposeAutoUpdater } from "./main/updater";
import { killUpdateSplash } from "./main/update-splash";
import {
  resolveBin,
  resolveBundledNodeBin,
  resolveBundledOpenClawDir,
  resolvePreloadPath,
  resolveRendererIndex,
  resolveRepoRoot,
} from "./main/openclaw/paths";
import { createTailBuffer, pickPort } from "./main/util/net";
import { createAppState } from "./main/app-state";
import { readConsentAccepted, writeConsentAccepted } from "./main/consent";
import { handleDeepLink } from "./main/deep-link";
import { createTray } from "./main/tray";
import { ensureMainWindow, showMainWindow } from "./main/window/window-manager";

if (process.env.ATOMICBOT_E2E_USER_DATA) {
  app.setPath("userData", process.env.ATOMICBOT_E2E_USER_DATA);
}

const MAIN_DIR = __dirname;
const DEEP_LINK_PROTOCOL = "atomicbot";

// Register as default protocol handler for atomicbot:// URLs
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
}

const st = createAppState();

const replayGatewayState = (win: BrowserWindow) => {
  if (st.gatewayState) {
    broadcastGatewayState(win, st.gatewayState, st);
  }
};

const ensureWin = () => ensureMainWindow(st, MAIN_DIR, replayGatewayState);
const showWin = () => showMainWindow(st, MAIN_DIR, replayGatewayState);

function ensureTray(): void {
  if (st.tray) {
    return;
  }
  st.tray = createTray({
    mainDir: MAIN_DIR,
    trayIconIsTemplate: platform.trayIconIsTemplate,
    onShow: () => void showWin(),
    onQuit: () => app.quit(),
  });
}

// macOS: handle protocol URL via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url, st.mainWindow);
});

// Windows/Linux: second instance receives the URL in argv
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    if (url) {
      handleDeepLink(url, st.mainWindow);
    }
    void showWin();
  });
}

app.on("window-all-closed", () => {
  if (!platform.keepAliveOnAllWindowsClosed) {
    app.quit();
  }
});

app.on("activate", () => {
  void showWin();
});

// Last-resort synchronous kill on process exit.
process.on("exit", () => {
  if (st.gatewayPid) {
    try {
      platform.killProcessTree(st.gatewayPid);
    } catch {
      // Already dead — nothing to do.
    }
    st.gatewayPid = null;
  }
});

app.on("before-quit", (event) => {
  if (st.isQuitting) {
    return;
  }
  st.isQuitting = true;
  event.preventDefault();

  disposeAutoUpdater();
  stopGatewayChild(st, platform)
    .then(() => {
      if (st.gatewayStateDir) {
        removeGatewayPid(st.gatewayStateDir);
      }
    })
    .finally(() => {
      app.quit();
    });
});

void app.whenReady().then(async () => {
  // Guard: second instance on Windows can reach whenReady after app.quit().
  if (!gotTheLock) {
    return;
  }
  const userData = app.getPath("userData");
  const stateDir = path.join(userData, "openclaw");
  st.gatewayStateDir = stateDir;
  const whisperDataDir = path.join(userData, "whisper");
  const logsDir = path.join(userData, "logs");
  st.logsDirForUi = logsDir;

  // Clean up orphaned gateway processes from previous crash / force-quit.
  const killedPid = killOrphanedGateway(stateDir);
  if (killedPid) {
    console.log(`[main] Cleaned up orphaned gateway process (PID ${killedPid})`);
  }
  // TODO: remove after 1-2 releases once orphan cleanup is proven reliable.
  try {
    platform.killAllByName("openclaw-gateway");
    console.log("[main] killed lingering openclaw-gateway processes");
  } catch {
    // No matching processes found — expected.
  }

  const configPath = path.join(stateDir, "openclaw.json");
  removeStaleGatewayLock(configPath);

  const openclawDir = app.isPackaged ? resolveBundledOpenClawDir() : resolveRepoRoot(MAIN_DIR);
  const nodeBin = app.isPackaged
    ? resolveBundledNodeBin()
    : (process.env.OPENCLAW_DESKTOP_NODE_BIN || "node").trim() || "node";
  const binOpts = { isPackaged: app.isPackaged, mainDir: MAIN_DIR };
  const gogBin = resolveBin("gog", binOpts);
  const jqBin = resolveBin("jq", binOpts);
  const memoBin = resolveBin("memo", binOpts);
  const remindctlBin = resolveBin("remindctl", binOpts);
  const obsidianCliBin = resolveBin("obsidian-cli", binOpts);
  const ghBin = resolveBin("gh", binOpts);
  const whisperCliBin = resolveBin("whisper-cli", binOpts);

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  let token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });
  runConfigMigrations({ configPath, stateDir });

  const rendererIndex = resolveRendererIndex({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    mainDir: MAIN_DIR,
  });
  st.preloadPath = resolvePreloadPath(MAIN_DIR);
  st.rendererIndex = rendererIndex;

  await ensureWin();
  ensureTray();

  killUpdateSplash();
  if (app.isPackaged) {
    initAutoUpdater(() => st.mainWindow);
  }

  const consentPath = path.join(stateDir, "consent.json");
  st.consentAccepted = readConsentAccepted(consentPath);

  const stderrTail = createTailBuffer(24_000);
  const startGateway = createGatewayStarter({
    state: st,
    platform,
    stderrTail,
    ensureWindow: ensureWin,
    port,
    logsDir,
    stateDir,
    configPath,
    getToken: () => token,
    url,
    openclawDir,
    nodeBin,
    gogBin,
    jqBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    whisperCliBin,
    whisperDataDir,
  });

  registerIpcHandlers({
    getMainWindow: () => st.mainWindow,
    getGatewayState: () => st.gatewayState,
    getLogsDir: () => st.logsDirForUi,
    getConsentAccepted: () => st.consentAccepted,
    acceptConsent: async () => {
      st.consentAccepted = true;
      writeConsentAccepted(consentPath);
    },
    startGateway,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    gogBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
    whisperCliBin,
    whisperDataDir,
    stopGatewayChild: () => stopGatewayChild(st, platform),
    getGatewayToken: () => token,
    setGatewayToken: (t: string) => {
      token = t;
    },
  });

  registerTerminalIpcHandlers({
    getMainWindow: () => st.mainWindow,
    stateDir,
    openclawDir,
    nodeBin,
    gogBin,
    jqBin,
    memoBin,
    remindctlBin,
    obsidianCliBin,
    ghBin,
  });

  await startGateway();
});
