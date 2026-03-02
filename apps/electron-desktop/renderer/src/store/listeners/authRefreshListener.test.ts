import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authReducer, authActions } from "../slices/auth/authSlice";
import {
  authRefreshListenerMiddleware,
  resetAuthRefreshListenerForTests,
  setupAuthRefreshListeners,
} from "./authRefreshListener";

const mockBackendApi = {
  getStatus: vi.fn().mockResolvedValue({
    hasKey: true,
    balance: { remaining: 42, limit: 100, usage: 58 },
    deployment: null,
    subscription: null,
  }),
  getBalance: vi.fn().mockResolvedValue({ remaining: 42, limit: 100, usage: 58 }),
};

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getStatus: (...args: unknown[]) => mockBackendApi.getStatus(...args),
    getBalance: (...args: unknown[]) => mockBackendApi.getBalance(...args),
  },
}));

function createStore() {
  setupAuthRefreshListeners();
  return configureStore({
    reducer: {
      auth: authReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(authRefreshListenerMiddleware.middleware),
  });
}

describe("authRefreshListener", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetAuthRefreshListenerForTests();
  });

  afterEach(() => {
    resetAuthRefreshListenerForTests();
    vi.useRealTimers();
  });

  it("runs immediate refresh after paid auth is set", async () => {
    const store = createStore();

    store.dispatch(authActions.setMode("paid"));
    store.dispatch(authActions.setAuth({ jwt: "jwt-1", email: "user@test.dev", userId: "u-1" }));
    await vi.waitFor(() => {
      expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      expect(store.getState().auth.lastRefreshAt).not.toBeNull();
    });
  });

  it("runs periodic refresh and stops when mode changes", async () => {
    const store = createStore();

    store.dispatch(authActions.setMode("paid"));
    store.dispatch(authActions.setAuth({ jwt: "jwt-1", email: "user@test.dev", userId: "u-1" }));
    await vi.waitFor(() => {
      expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(1);
    });
    expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(2);

    store.dispatch(authActions.setMode("self-managed"));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(2);
  });

  it("refreshes on focus signal when paid and authenticated", async () => {
    const store = createStore();

    store.dispatch(authActions.setMode("paid"));
    store.dispatch(authActions.setAuth({ jwt: "jwt-1", email: "user@test.dev", userId: "u-1" }));
    await vi.waitFor(() => {
      expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(1);
    });
    mockBackendApi.getStatus.mockClear();

    await vi.advanceTimersByTimeAsync(15_000);
    store.dispatch(authActions.appFocused());
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBackendApi.getStatus).toHaveBeenCalledTimes(1);
  });

  it("applies backoff after failed refresh", async () => {
    mockBackendApi.getStatus.mockRejectedValueOnce(new Error("network down"));
    const store = createStore();

    store.dispatch(authActions.setMode("paid"));
    store.dispatch(authActions.setAuth({ jwt: "jwt-1", email: "user@test.dev", userId: "u-1" }));
    await vi.waitFor(() => {
      expect(store.getState().auth.refreshFailureCount).toBe(1);
    });
    const state = store.getState().auth;
    expect(state.refreshError).toBe("network down");
    expect(state.nextAllowedAt).not.toBeNull();
  });
});
