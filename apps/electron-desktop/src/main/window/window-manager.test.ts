import { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

import { createAppState } from "../app-state";
import { ensureMainWindow, showMainWindow } from "./window-manager";

describe("ensureMainWindow", () => {
  it("returns existing window if not destroyed", async () => {
    const state = createAppState();
    const existing = new BrowserWindow();
    state.mainWindow = existing;

    const result = await ensureMainWindow(state, "/app/src");

    expect(result).toBe(existing);
  });

  it("returns null when preloadPath is not set", async () => {
    const state = createAppState();

    const result = await ensureMainWindow(state, "/app/src");

    expect(result).toBeNull();
  });

  it("creates new window when preloadPath and rendererIndex are set", async () => {
    const state = createAppState();
    state.preloadPath = "/preload.js";
    state.rendererIndex = "/index.html";

    const result = await ensureMainWindow(state, "/app/src");

    expect(result).toBeInstanceOf(BrowserWindow);
    expect(state.mainWindow).toBe(result);
  });

  it("calls onNewWindow callback only for newly created windows", async () => {
    const state = createAppState();
    state.preloadPath = "/preload.js";
    state.rendererIndex = "/index.html";
    const onNew = vi.fn();

    await ensureMainWindow(state, "/app/src", onNew);
    expect(onNew).toHaveBeenCalledTimes(1);

    // Second call returns existing — no callback
    onNew.mockClear();
    await ensureMainWindow(state, "/app/src", onNew);
    expect(onNew).not.toHaveBeenCalled();
  });
});

describe("showMainWindow", () => {
  it("does nothing when no window can be created", async () => {
    const state = createAppState();
    await expect(showMainWindow(state, "/app/src")).resolves.toBeUndefined();
  });

  it("shows and focuses the window", async () => {
    const state = createAppState();
    state.preloadPath = "/preload.js";
    state.rendererIndex = "/index.html";

    await showMainWindow(state, "/app/src");

    const win = state.mainWindow as BrowserWindow;
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("restores a minimized window", async () => {
    const state = createAppState();
    const win = new BrowserWindow();
    (win.isMinimized as ReturnType<typeof vi.fn>).mockReturnValue(true);
    state.mainWindow = win;

    await showMainWindow(state, "/app/src");

    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
  });
});
