/**
 * IPC handlers for app config, consent, gateway info, and launch-at-login.
 */
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

import { IPC } from "../../shared/ipc-channels";
import type { ConfigHandlerParams } from "./types";

export function registerConfigHandlers(params: ConfigHandlerParams) {
  ipcMain.handle(IPC.gatewayGetInfo, async () => ({ state: params.getGatewayState() }));

  ipcMain.handle(IPC.consentGet, async () => ({ accepted: params.getConsentAccepted() }));

  ipcMain.handle(IPC.consentAccept, async () => {
    await params.acceptConsent();
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle(IPC.gatewayStart, async () => {
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle(IPC.gatewayRetry, async () => {
    app.relaunch();
    app.exit(0);
  });

  // OpenClaw config (openclaw.json) read/write.
  const configJsonPath = path.join(params.stateDir, "openclaw.json");

  ipcMain.handle(IPC.configRead, async () => {
    try {
      if (!fs.existsSync(configJsonPath)) {
        return { ok: true, content: "" };
      }
      const content = fs.readFileSync(configJsonPath, "utf-8");
      return { ok: true, content };
    } catch (err) {
      return { ok: false, content: "", error: String(err) };
    }
  });

  ipcMain.handle(IPC.configWrite, async (_evt, p: { content?: unknown }) => {
    const content = typeof p?.content === "string" ? p.content : "";
    try {
      JSON.parse(content);
    } catch (err) {
      console.warn("[ipc/config] config-write JSON parse failed:", err);
      return { ok: false, error: "Invalid JSON" };
    }
    try {
      fs.mkdirSync(path.dirname(configJsonPath), { recursive: true });
      fs.writeFileSync(configJsonPath, content, "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Launch at login (auto-start) IPC handlers.
  ipcMain.handle(IPC.launchAtLoginGet, () => {
    const settings = app.getLoginItemSettings();
    return { enabled: settings.openAtLogin };
  });

  ipcMain.handle(IPC.launchAtLoginSet, (_evt, p: { enabled?: unknown }) => {
    const enabled = typeof p?.enabled === "boolean" ? p.enabled : false;
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { ok: true } as const;
  });

  // App version
  ipcMain.handle(IPC.getAppVersion, () => {
    return { version: app.getVersion() };
  });
}
