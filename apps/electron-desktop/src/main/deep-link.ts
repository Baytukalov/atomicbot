import type { BrowserWindow } from "electron";
import { IPC_EVENTS } from "../shared/ipc-channels";

export type DeepLinkData = {
  host: string;
  pathname: string;
  params: Record<string, string>;
};

export function parseDeepLinkUrl(url: string): DeepLinkData | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      pathname: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams.entries()),
    };
  } catch {
    return null;
  }
}

export function handleDeepLink(url: string, win: BrowserWindow | null): void {
  const data = parseDeepLinkUrl(url);
  if (!data) {
    console.warn("[main] Failed to parse deep link URL:", url);
    return;
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.deepLink, data);
  }
}
