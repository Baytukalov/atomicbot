// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authActions } from "@store/slices/auth/authSlice";
import { usePaidStatusBridge } from "./usePaidStatusBridge";

type DeepLinkCb = (payload: {
  host: string;
  pathname: string;
  params: Record<string, string>;
}) => void;

const dispatchMock = vi.fn();
const mockFetchBalance = vi.fn(() => ({ type: "auth/fetchBalance" }));
const mockAddToast = vi.fn();
const mockGetDesktopApiOrNull = vi.fn();
const mockAuthState = {
  balance: { remaining: 1.0, limit: 10, usage: 9 } as {
    remaining: number;
    limit: number;
    usage: number;
  } | null,
};

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (st: unknown) => unknown) => selector({ auth: mockAuthState }),
}));

vi.mock("@store/slices/auth/authSlice", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchBalance: () => mockFetchBalance(),
  };
});

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockGetDesktopApiOrNull(),
}));

vi.mock("@shared/toast", () => ({
  addToast: (message: string) => mockAddToast(message),
}));

function setupDeepLink(): { getCb: () => DeepLinkCb | null } {
  let deepLinkCb: DeepLinkCb | null = null;
  mockGetDesktopApiOrNull.mockReturnValue({
    onDeepLink: (cb: DeepLinkCb) => {
      deepLinkCb = cb;
      return () => {
        deepLinkCb = null;
      };
    },
  });
  return { getCb: () => deepLinkCb };
}

describe("usePaidStatusBridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetDesktopApiOrNull.mockReturnValue(null);
    mockAuthState.balance = { remaining: 1.0, limit: 10, usage: 9 };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dispatches appFocused on window focus", () => {
    renderHook(() => usePaidStatusBridge());

    window.dispatchEvent(new Event("focus"));

    expect(dispatchMock).toHaveBeenCalledWith(authActions.appFocused());
  });

  it("dispatches appVisible only when document is visible", () => {
    renderHook(() => usePaidStatusBridge());

    const callsBefore = dispatchMock.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const callsAfterHidden = dispatchMock.mock.calls.length;

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(callsAfterHidden).toBe(callsBefore);
    expect(dispatchMock.mock.calls.length).toBeGreaterThan(callsAfterHidden);
    expect(dispatchMock).toHaveBeenCalledWith(authActions.appVisible());
  });

  it("removes listeners on unmount", () => {
    const { unmount } = renderHook(() => usePaidStatusBridge());
    const callsBeforeUnmount = dispatchMock.mock.calls.length;
    unmount();

    window.dispatchEvent(new Event("focus"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(dispatchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it("shows toast immediately when balance increases on first poll", async () => {
    const { getCb } = setupDeepLink();

    dispatchMock.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ remaining: 11.0, limit: 10, usage: 9 }),
    });

    renderHook(() => usePaidStatusBridge());

    await act(async () => {
      getCb()!({ host: "addon-success", pathname: "/", params: {} });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchBalance).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith("Balance updated!");
  });

  it("polls until balance increases then shows toast", async () => {
    const { getCb } = setupDeepLink();
    const unwrapMock = vi
      .fn()
      .mockResolvedValueOnce({ remaining: 1.0, limit: 10, usage: 9 })
      .mockResolvedValueOnce({ remaining: 11.0, limit: 10, usage: 9 });

    dispatchMock.mockReturnValue({ unwrap: unwrapMock });

    renderHook(() => usePaidStatusBridge());

    await act(async () => {
      getCb()!({ host: "addon-success", pathname: "/", params: {} });
      // First poll (immediate) returns stale balance
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchBalance).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalled();

    // Second poll after 2s returns updated balance
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockFetchBalance).toHaveBeenCalledTimes(2);
    expect(mockAddToast).toHaveBeenCalledWith("Balance updated!");
  });

  it("shows fallback toast after exhausting all retries", async () => {
    const { getCb } = setupDeepLink();
    dispatchMock.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ remaining: 1.0, limit: 10, usage: 9 }),
    });

    renderHook(() => usePaidStatusBridge());

    await act(async () => {
      getCb()!({ host: "addon-success", pathname: "/", params: {} });
      await vi.runAllTimersAsync();
    });

    expect(mockFetchBalance.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(mockAddToast).toHaveBeenCalledWith("Balance is being updated...");
  });

  it("ignores deep links with other hosts", async () => {
    const { getCb } = setupDeepLink();
    renderHook(() => usePaidStatusBridge());

    await act(async () => {
      getCb()!({ host: "addon-cancel", pathname: "/", params: {} });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchBalance).not.toHaveBeenCalled();
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it("unsubscribes deep link listener on unmount", () => {
    const { getCb } = setupDeepLink();

    const { unmount } = renderHook(() => usePaidStatusBridge());
    expect(getCb()).not.toBeNull();

    unmount();
    expect(getCb()).toBeNull();
  });

  it("cancels polling on unmount", async () => {
    const { getCb } = setupDeepLink();
    dispatchMock.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ remaining: 1.0, limit: 10, usage: 9 }),
    });

    const { unmount } = renderHook(() => usePaidStatusBridge());

    await act(async () => {
      getCb()!({ host: "addon-success", pathname: "/", params: {} });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchBalance).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    // No additional calls after unmount
    expect(mockFetchBalance).toHaveBeenCalledTimes(1);
  });
});
