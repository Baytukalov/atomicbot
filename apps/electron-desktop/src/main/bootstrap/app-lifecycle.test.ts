import { app } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppState } from "../app-state";
import { registerAppLifecycle, registerProtocolHandler } from "./app-lifecycle";

describe("registerProtocolHandler", () => {
  const originalArgv = process.argv.slice();
  const originalDefaultApp = (process as { defaultApp?: boolean }).defaultApp;

  beforeEach(() => {
    vi.mocked(app.setAsDefaultProtocolClient).mockReset();
  });

  afterEach(() => {
    process.argv = originalArgv.slice();
    (process as { defaultApp?: boolean }).defaultApp = originalDefaultApp;
  });

  it("registers protocol for packaged app", () => {
    (process as { defaultApp?: boolean }).defaultApp = false;
    registerProtocolHandler("atomicbot");
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("atomicbot");
  });

  it("registers protocol with argv for default app", () => {
    (process as { defaultApp?: boolean }).defaultApp = true;
    process.argv = ["/usr/bin/node", "./src/main.ts"];
    registerProtocolHandler("atomicbot");
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledTimes(1);
    const args = vi.mocked(app.setAsDefaultProtocolClient).mock.calls[0];
    expect(args?.[0]).toBe("atomicbot");
    expect(args?.[1]).toBe(process.execPath);
    expect(Array.isArray(args?.[2])).toBe(true);
  });
});

describe("registerAppLifecycle", () => {
  beforeEach(() => {
    vi.mocked(app.on).mockReset();
    vi.mocked(app.quit).mockReset();
    vi.mocked(app.requestSingleInstanceLock).mockReset();
  });

  it("returns false and quits when single-instance lock fails", () => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValue(false);
    const ok = registerAppLifecycle({
      protocol: "atomicbot",
      state: createAppState(),
      platform: {
        keepAliveOnAllWindowsClosed: false,
        killProcessTree: vi.fn(),
      } as never,
      showWindow: vi.fn(async () => {}),
      handleDeepLink: vi.fn(),
      disposeAutoUpdater: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
      stopLlamacppServer: vi.fn(async () => {}),
      removeGatewayPid: vi.fn(),
    });
    expect(ok).toBe(false);
    expect(app.quit).toHaveBeenCalled();
  });

  it("registers handlers and runs before-quit flow", async () => {
    vi.mocked(app.requestSingleInstanceLock).mockReturnValue(true);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    vi.mocked(app.on).mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, cb);
      return app as never;
    });

    const state = createAppState();
    state.gatewayStateDir = "/tmp/state";
    const stopGatewayChild = vi.fn(async () => {});
    const stopLlamacppServer = vi.fn(async () => {});
    const removeGatewayPid = vi.fn();
    const disposeAutoUpdater = vi.fn();
    const showWindow = vi.fn(async () => {});
    const handleDeepLink = vi.fn();
    const killProcessTree = vi.fn();

    const ok = registerAppLifecycle({
      protocol: "atomicbot",
      state,
      platform: {
        keepAliveOnAllWindowsClosed: false,
        killProcessTree,
      } as never,
      showWindow,
      handleDeepLink,
      disposeAutoUpdater,
      stopGatewayChild,
      stopLlamacppServer,
      removeGatewayPid,
    });

    expect(ok).toBe(true);
    handlers.get("second-instance")?.({}, ["atomicbot://foo"]);
    expect(handleDeepLink).toHaveBeenCalled();
    expect(showWindow).toHaveBeenCalled();

    const event = { preventDefault: vi.fn() };
    handlers.get("before-quit")?.(event);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(disposeAutoUpdater).toHaveBeenCalled();
    expect(stopGatewayChild).toHaveBeenCalled();
    expect(stopLlamacppServer).toHaveBeenCalled();
    expect(removeGatewayPid).toHaveBeenCalledWith("/tmp/state");
    expect(app.quit).toHaveBeenCalled();
  });
});
