import { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

import { createAppState, type AppState } from "../app-state";
import type { Platform } from "../platform";
import { broadcastGatewayState, stopGatewayChild } from "./lifecycle";

function makePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    name: "darwin",
    init: vi.fn(),
    killProcess: vi.fn(),
    killProcessTree: vi.fn(),
    killAllByName: vi.fn(),
    isProcessAlive: vi.fn(() => false),
    forceKillChild: vi.fn(),
    gatewaySpawnOptions: vi.fn(() => ({ detached: false, extraArgs: [], startupTimeoutMs: 5000 })),
    defaultShell: vi.fn(() => "/bin/sh"),
    createCliWrapper: vi.fn(() => "/tmp/wrapper"),
    binaryExtension: vi.fn(() => ""),
    ffmpegBinaryName: vi.fn(() => "ffmpeg"),
    ffmpegDownloadUrl: vi.fn(() => null),
    appConfigSearchPaths: vi.fn(() => []),
    restrictFilePermissions: vi.fn(),
    makeExecutable: vi.fn(),
    removeQuarantine: vi.fn(),
    extractZip: vi.fn(),
    keepAliveOnAllWindowsClosed: true,
    trayIconIsTemplate: true,
    showUpdateSplash: vi.fn(),
    killUpdateSplash: vi.fn(),
    gatewayLockDirSuffix: vi.fn(() => "openclaw"),
    ...overrides,
  } as Platform;
}

describe("broadcastGatewayState", () => {
  it("updates state.gatewayState and sends to window", () => {
    const state = createAppState();
    const win = new BrowserWindow();
    const gwState = {
      kind: "ready" as const,
      port: 8080,
      logsDir: "/logs",
      url: "http://localhost:8080/",
      token: "t",
    };

    broadcastGatewayState(win, gwState, state);

    expect(state.gatewayState).toBe(gwState);
    expect(win.webContents.send).toHaveBeenCalledWith("gateway-state", gwState);
  });

  it("updates state even when window is null", () => {
    const state = createAppState();
    const gwState = { kind: "starting" as const, port: 8080, logsDir: "/logs", token: "t" };

    broadcastGatewayState(null, gwState, state);

    expect(state.gatewayState).toBe(gwState);
  });
});

describe("stopGatewayChild", () => {
  it("returns immediately when gatewayPid is null", async () => {
    const state = createAppState();
    const plat = makePlatform();

    await stopGatewayChild(state, plat);

    expect(plat.killProcess).not.toHaveBeenCalled();
  });

  it("clears gateway and gatewayPid when process dies immediately", async () => {
    const state = createAppState();
    state.gatewayPid = 1234;
    state.gateway = { pid: 1234 } as AppState["gateway"];
    const plat = makePlatform({ isProcessAlive: vi.fn(() => false) });

    await stopGatewayChild(state, plat);

    expect(plat.killProcess).toHaveBeenCalledWith(1234);
    expect(state.gatewayPid).toBeNull();
    expect(state.gateway).toBeNull();
  });

  it("clears state when killProcess throws (already dead)", async () => {
    const state = createAppState();
    state.gatewayPid = 999;
    state.gateway = { pid: 999 } as AppState["gateway"];
    const plat = makePlatform({
      killProcess: vi.fn(() => {
        throw new Error("no such process");
      }),
    });

    await stopGatewayChild(state, plat);

    expect(state.gatewayPid).toBeNull();
    expect(state.gateway).toBeNull();
  });
});
