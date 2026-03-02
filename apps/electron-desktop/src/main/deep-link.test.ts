import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

import { handleDeepLink, parseDeepLinkUrl } from "./deep-link";

function makeFakeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;
}

describe("parseDeepLinkUrl", () => {
  it("parses a valid deep link URL", () => {
    const result = parseDeepLinkUrl("atomicbot://callback?code=abc&state=xyz");
    expect(result).toEqual({
      host: "callback",
      pathname: "",
      params: { code: "abc", state: "xyz" },
    });
  });

  it("parses URL with pathname", () => {
    const result = parseDeepLinkUrl("atomicbot://auth/callback?token=123");
    expect(result).toEqual({
      host: "auth",
      pathname: "/callback",
      params: { token: "123" },
    });
  });

  it("parses URL with no query params", () => {
    const result = parseDeepLinkUrl("atomicbot://open");
    expect(result).toEqual({ host: "open", pathname: "", params: {} });
  });

  it("returns null for invalid URL", () => {
    expect(parseDeepLinkUrl("not a url!!!")).toBeNull();
  });
});

describe("handleDeepLink", () => {
  it("sends parsed deep link data to the window", () => {
    const win = makeFakeWindow();
    handleDeepLink("atomicbot://callback?code=abc&state=xyz", win);
    expect(win.webContents.send).toHaveBeenCalledWith("deep-link", {
      host: "callback",
      pathname: "",
      params: { code: "abc", state: "xyz" },
    });
  });

  it("does nothing when window is null", () => {
    expect(() => handleDeepLink("atomicbot://callback?code=abc", null)).not.toThrow();
  });

  it("does nothing when window is destroyed", () => {
    const win = makeFakeWindow(true);
    handleDeepLink("atomicbot://callback?code=abc", win);
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it("does not throw for invalid URL", () => {
    const win = makeFakeWindow();
    expect(() => handleDeepLink("bad url", win)).not.toThrow();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
