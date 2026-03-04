/**
 * Tests for authSlice — initial state, reducers, and all thunks.
 */
import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AuthSliceState,
  authActions,
  authReducer,
  restoreMode,
  storeAuthToken,
  clearAuth,
  switchToSubscription,
  switchToSelfManaged,
  applySubscriptionKeys,
  handleLogout,
  createAddonCheckout,
  fetchAutoTopUpSettings,
  patchAutoTopUpSettings,
} from "./authSlice";
import { DEFAULT_AUTO_TOP_UP_SETTINGS } from "./auth-types";
import { configReducer } from "../configSlice";

// ── localStorage shim ───────────────────────────────────────────────────────

const storageMap = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

const MODE_LS_KEY = "openclaw-desktop-mode";
const AUTH_TOKEN_LS_KEY = "openclaw-auth-token";
const BACKUP_LS_KEY = "openclaw-self-managed-backup";
const PAID_BACKUP_LS_KEY = "openclaw-paid-backup";

// ── Mock desktop API ────────────────────────────────────────────────────────

const mockApi = {
  authReadProfiles: vi.fn().mockResolvedValue({ profiles: {}, order: {} }),
  authWriteProfiles: vi.fn().mockResolvedValue(undefined),
  setApiKey: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockApi,
}));

// ── Mock backend API ────────────────────────────────────────────────────────

const mockBackendApi = {
  getKeys: vi.fn().mockResolvedValue({ openrouterApiKey: "sk-or-test-key", openaiApiKey: null }),
  getStatus: vi
    .fn()
    .mockResolvedValue({ hasKey: true, balance: null, deployment: null, subscription: null }),
  getBalance: vi.fn().mockResolvedValue({ remaining: 50, limit: 100, usage: 50 }),
  createAddonCheckout: vi.fn().mockResolvedValue({ checkoutUrl: "https://stripe.test/checkout" }),
  getAutoTopUpSettings: vi.fn().mockResolvedValue({
    enabled: true,
    thresholdUsd: 2,
    topupAmountUsd: 10,
    monthlyCapUsd: 300,
    stripePaymentMethodId: null,
    lastTriggeredAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    hasPaymentMethod: true,
    currentMonthSpentUsd: 42,
  }),
  updateAutoTopUpSettings: vi.fn().mockResolvedValue({
    enabled: false,
    thresholdUsd: 3,
    topupAmountUsd: 15,
    monthlyCapUsd: 200,
    stripePaymentMethodId: null,
    lastTriggeredAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    hasPaymentMethod: true,
    currentMonthSpentUsd: 10,
  }),
};

vi.mock("@ipc/backendApi", () => ({
  backendApi: {
    getKeys: (...args: unknown[]) => mockBackendApi.getKeys(...args),
    getStatus: (...args: unknown[]) => mockBackendApi.getStatus(...args),
    getBalance: (...args: unknown[]) => mockBackendApi.getBalance(...args),
    createAddonCheckout: (...args: unknown[]) => mockBackendApi.createAddonCheckout(...args),
    getAutoTopUpSettings: (...args: unknown[]) => mockBackendApi.getAutoTopUpSettings(...args),
    updateAutoTopUpSettings: (...args: unknown[]) =>
      mockBackendApi.updateAutoTopUpSettings(...args),
  },
}));

// ── Test store factory ──────────────────────────────────────────────────────

function createTestStore() {
  return configureStore({
    reducer: { auth: authReducer, config: configReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActionPaths: ["meta.arg.request"],
        },
      }),
  });
}

// ── Mock gateway request ────────────────────────────────────────────────────

function createMockRequest() {
  const configSnap = {
    config: {
      auth: {
        profiles: { "anthropic:default": { provider: "anthropic", mode: "api_key" } },
        order: { anthropic: ["anthropic:default"] },
      },
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4.6" },
          models: { "anthropic/claude-sonnet-4.6": {} },
        },
      },
    },
    hash: "abc123",
    exists: true,
  };

  return vi.fn().mockImplementation((method: string) => {
    if (method === "config.get") return Promise.resolve(configSnap);
    if (method === "config.patch") return Promise.resolve({ ok: true });
    return Promise.resolve({});
  });
}

// ── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  storageMap.clear();
  // @ts-expect-error - shimming localStorage for node env
  globalThis.localStorage = localStorageShim;

  vi.clearAllMocks();
  mockApi.authReadProfiles.mockResolvedValue({ profiles: {}, order: {} });
});

afterEach(() => {
  storageMap.clear();
});

// ── clearAuthState / clearAuth parity ───────────────────────────────────────

describe("clearAuthState and clearAuth parity", () => {
  it("clearAuthState reducer and clearAuth.fulfilled produce identical auth fields", () => {
    const full: AuthSliceState = {
      mode: "paid",
      jwt: "tok",
      email: "a@b.com",
      userId: "u1",
      balance: { remaining: 1, limit: 2, usage: 1 },
      deployment: { id: "d1", status: "running", billingStatus: "active", dropletId: null },
      subscription: {
        status: "active",
        currentPeriodEnd: "2026-03-01",
        stripeSubscriptionId: "sub_1",
      },
      loading: false,
      error: "err",
      lastRefreshAt: 12345,
      refreshInFlight: true,
      refreshError: "refresh-err",
      nextAllowedAt: 99999,
      refreshFailureCount: 3,
      topUpPending: true,
      topUpError: "top-up-err",
      balancePolling: true,
      autoTopUp: {
        enabled: false,
        thresholdUsd: 8,
        topupAmountUsd: 25,
        monthlyCapUsd: 90,
        hasPaymentMethod: true,
        currentMonthSpentUsd: 14,
      },
      autoTopUpLoading: true,
      autoTopUpSaving: true,
      autoTopUpError: "atop-err",
      autoTopUpLoaded: true,
    };

    const viaReducer = authReducer(full, authActions.clearAuthState());
    const viaThunk = authReducer(full, clearAuth.fulfilled(undefined, "test-req"));

    const resetFields = [
      "jwt",
      "email",
      "userId",
      "balance",
      "deployment",
      "subscription",
      "error",
      "lastRefreshAt",
      "refreshInFlight",
      "refreshError",
      "nextAllowedAt",
      "refreshFailureCount",
      "topUpPending",
      "topUpError",
      "balancePolling",
      "autoTopUp",
      "autoTopUpLoading",
      "autoTopUpSaving",
      "autoTopUpError",
      "autoTopUpLoaded",
    ] as const;

    for (const field of resetFields) {
      expect(viaReducer[field]).toEqual(viaThunk[field]);
    }
  });
});

// ── Initial state ───────────────────────────────────────────────────────────

describe("authSlice initial state", () => {
  it("starts with all fields null/false", () => {
    const state = authReducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({
      mode: null,
      jwt: null,
      email: null,
      userId: null,
      balance: null,
      deployment: null,
      subscription: null,
      loading: false,
      error: null,
      lastRefreshAt: null,
      refreshInFlight: false,
      refreshError: null,
      nextAllowedAt: null,
      refreshFailureCount: 0,
      topUpPending: false,
      topUpError: null,
      balancePolling: false,
      autoTopUp: DEFAULT_AUTO_TOP_UP_SETTINGS,
      autoTopUpLoading: false,
      autoTopUpSaving: false,
      autoTopUpError: null,
      autoTopUpLoaded: false,
    });
  });
});

// ── Reducers ────────────────────────────────────────────────────────────────

describe("authSlice reducers", () => {
  const base: AuthSliceState = {
    mode: null,
    jwt: null,
    email: null,
    userId: null,
    balance: null,
    deployment: null,
    subscription: null,
    loading: false,
    error: null,
    lastRefreshAt: null,
    refreshInFlight: false,
    refreshError: null,
    nextAllowedAt: null,
    refreshFailureCount: 0,
    topUpPending: false,
    topUpError: null,
    balancePolling: false,
    autoTopUp: DEFAULT_AUTO_TOP_UP_SETTINGS,
    autoTopUpLoading: false,
    autoTopUpSaving: false,
    autoTopUpError: null,
    autoTopUpLoaded: false,
  };

  it("setMode sets mode to paid", () => {
    const state = authReducer(base, authActions.setMode("paid"));
    expect(state.mode).toBe("paid");
  });

  it("setMode sets mode to self-managed", () => {
    const state = authReducer(base, authActions.setMode("self-managed"));
    expect(state.mode).toBe("self-managed");
  });

  it("setAuth sets jwt, email, userId and clears error", () => {
    const withError = { ...base, error: "some error" };
    const state = authReducer(
      withError,
      authActions.setAuth({ jwt: "tok", email: "a@b.com", userId: "u1" })
    );
    expect(state.jwt).toBe("tok");
    expect(state.email).toBe("a@b.com");
    expect(state.userId).toBe("u1");
    expect(state.error).toBeNull();
  });

  it("setBalance sets balance", () => {
    const state = authReducer(
      base,
      authActions.setBalance({ remaining: 90, limit: 100, usage: 10 })
    );
    expect(state.balance).toEqual({ remaining: 90, limit: 100, usage: 10 });
  });

  it("setBalance clears balance with null", () => {
    const withBalance = {
      ...base,
      balance: { remaining: 90, limit: 100, usage: 10 },
    };
    const state = authReducer(withBalance, authActions.setBalance(null));
    expect(state.balance).toBeNull();
  });

  it("clearAuthState clears all auth fields", () => {
    const full: AuthSliceState = {
      ...base,
      jwt: "tok",
      email: "a@b.com",
      userId: "u1",
      balance: { remaining: 1, limit: 2, usage: 1 },
      deployment: { id: "d1", status: "running", billingStatus: "active", dropletId: null },
      subscription: {
        status: "active",
        currentPeriodEnd: "2026-03-01",
        stripeSubscriptionId: "sub_1",
      },
      error: "err",
    };
    const state = authReducer(full, authActions.clearAuthState());
    expect(state.jwt).toBeNull();
    expect(state.email).toBeNull();
    expect(state.userId).toBeNull();
    expect(state.balance).toBeNull();
    expect(state.deployment).toBeNull();
    expect(state.subscription).toBeNull();
    expect(state.error).toBeNull();
  });
});

// ── restoreMode thunk ───────────────────────────────────────────────────────

describe("restoreMode thunk", () => {
  it("with JWT in localStorage: sets mode paid and auth data", async () => {
    storageMap.set(
      AUTH_TOKEN_LS_KEY,
      JSON.stringify({ jwt: "jwt-tok", email: "user@test.com", userId: "uid1" })
    );

    const store = createTestStore();
    await store.dispatch(restoreMode());

    const state = store.getState().auth;
    expect(state.mode).toBe("paid");
    expect(state.jwt).toBe("jwt-tok");
    expect(state.email).toBe("user@test.com");
    expect(state.userId).toBe("uid1");
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
  });

  it("without JWT but mode in localStorage: restores mode", async () => {
    storageMap.set(MODE_LS_KEY, "paid");

    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
  });

  it("without JWT and no persisted mode: mode stays null", async () => {
    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBeNull();
  });

  it("restores self-managed mode from localStorage", async () => {
    storageMap.set(MODE_LS_KEY, "self-managed");

    const store = createTestStore();
    await store.dispatch(restoreMode());

    expect(store.getState().auth.mode).toBe("self-managed");
  });
});

// ── storeAuthToken thunk ────────────────────────────────────────────────────

describe("storeAuthToken thunk", () => {
  it("stores token in localStorage and sets state", async () => {
    const store = createTestStore();
    await store.dispatch(
      storeAuthToken({ jwt: "j1", email: "e@t.com", userId: "u1", isNewUser: false })
    );

    const state = store.getState().auth;
    expect(state.jwt).toBe("j1");
    expect(state.email).toBe("e@t.com");
    expect(state.userId).toBe("u1");
    expect(state.mode).toBe("paid");

    const persisted = JSON.parse(storageMap.get(AUTH_TOKEN_LS_KEY)!);
    expect(persisted).toEqual({ jwt: "j1", email: "e@t.com", userId: "u1" });
  });
});

// ── clearAuth thunk ─────────────────────────────────────────────────────────

describe("clearAuth thunk", () => {
  it("clears auth state and removes token from localStorage", async () => {
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "tok", email: "a@b.com", userId: "u1" }));
    storageMap.set(
      AUTH_TOKEN_LS_KEY,
      JSON.stringify({ jwt: "tok", email: "a@b.com", userId: "u1" })
    );
    expect(store.getState().auth.jwt).toBe("tok");

    await store.dispatch(clearAuth());

    const state = store.getState().auth;
    expect(state.jwt).toBeNull();
    expect(state.email).toBeNull();
    expect(state.userId).toBeNull();
    expect(storageMap.has(AUTH_TOKEN_LS_KEY)).toBe(false);
  });
});

// ── switchToSubscription thunk ──────────────────────────────────────────────

describe("switchToSubscription thunk", () => {
  it("backs up config and credentials to localStorage", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: { "anthropic:default": { key: "sk-ant-xxx" } },
      order: { anthropic: ["anthropic:default"] },
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    const backup = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backup.credentials.profiles).toHaveProperty("anthropic:default");
    expect(backup.configAuth.profiles).toHaveProperty("anthropic:default");
    expect(backup.configModel.primary).toBe("anthropic/claude-sonnet-4.6");
    expect(backup.savedAt).toBeDefined();
  });

  it("clears credentials via IPC", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(mockApi.authWriteProfiles).toHaveBeenCalledWith({ profiles: {}, order: {} });
  });

  it("sends config.patch with null for auth and empty string for model", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(mockRequest).toHaveBeenCalledWith("config.get", {});
    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });

  it("sets mode to paid in state and localStorage", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(store.getState().auth.mode).toBe("paid");
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
  });

  it("does not overwrite existing backup on second call (idempotent)", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: "sk-ant-real" },
      },
      order: { anthropic: ["anthropic:default"] },
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store.dispatch(switchToSubscription({ request: mockRequest }));
    const backupAfterFirst = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backupAfterFirst.credentials.profiles["anthropic:default"].key).toBe("sk-ant-real");

    mockApi.authReadProfiles.mockResolvedValue({
      profiles: {},
      order: {},
    });

    await store.dispatch(switchToSubscription({ request: mockRequest }));
    const backupAfterSecond = JSON.parse(storageMap.get(BACKUP_LS_KEY)!);
    expect(backupAfterSecond.credentials.profiles["anthropic:default"].key).toBe("sk-ant-real");
  });

  it("restores paid backup when JWT is valid", async () => {
    const paidBackup = {
      authToken: { jwt: "paid-jwt", email: "paid@test.com", userId: "pu1" },
      credentials: {
        profiles: { "openrouter:default": { provider: "openrouter", mode: "api_key" } },
        order: { openrouter: ["openrouter:default"] },
      },
      configAuth: {
        profiles: { "openrouter:default": { provider: "openrouter", mode: "api_key" } },
        order: { openrouter: ["openrouter:default"] },
      },
      configModel: {
        primary: "openrouter/anthropic/claude-sonnet-4.6",
        models: { "openrouter/anthropic/claude-sonnet-4.6": {} },
      },
      savedAt: "2026-03-01T00:00:00.000Z",
    };
    storageMap.set(PAID_BACKUP_LS_KEY, JSON.stringify(paidBackup));

    mockBackendApi.getStatus.mockResolvedValueOnce({
      hasKey: true,
      balance: null,
      deployment: null,
      subscription: null,
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(store.getState().auth.jwt).toBe("paid-jwt");
    expect(store.getState().auth.email).toBe("paid@test.com");
    expect(store.getState().auth.userId).toBe("pu1");

    const persisted = JSON.parse(storageMap.get(AUTH_TOKEN_LS_KEY)!);
    expect(persisted.jwt).toBe("paid-jwt");

    expect(mockApi.authWriteProfiles).toHaveBeenCalledWith({
      profiles: paidBackup.credentials.profiles,
      order: paidBackup.credentials.order,
    });

    expect(storageMap.has(PAID_BACKUP_LS_KEY)).toBe(false);
  });

  it("discards paid backup when JWT is expired (backend rejects)", async () => {
    const paidBackup = {
      authToken: { jwt: "expired-jwt", email: "old@test.com", userId: "ou1" },
      credentials: {
        profiles: { "openrouter:default": { provider: "openrouter" } },
        order: { openrouter: ["openrouter:default"] },
      },
      configAuth: {},
      configModel: { primary: "openrouter/anthropic/claude-sonnet-4.6" },
      savedAt: "2026-01-01T00:00:00.000Z",
    };
    storageMap.set(PAID_BACKUP_LS_KEY, JSON.stringify(paidBackup));

    mockBackendApi.getStatus.mockRejectedValueOnce(new Error("Unauthorized"));

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(store.getState().auth.jwt).toBeNull();
    expect(store.getState().auth.email).toBeNull();
    expect(storageMap.has(AUTH_TOKEN_LS_KEY)).toBe(false);
    expect(storageMap.has(PAID_BACKUP_LS_KEY)).toBe(false);
  });

  it("does not attempt restore when no paid backup exists", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSubscription({ request: mockRequest }));

    expect(mockBackendApi.getStatus).not.toHaveBeenCalled();
    expect(store.getState().auth.jwt).toBeNull();
  });
});

// ── switchToSelfManaged thunk ───────────────────────────────────────────────

describe("switchToSelfManaged thunk", () => {
  const savedBackup = {
    credentials: {
      profiles: { "anthropic:default": { key: "sk-ant-xxx" } },
      order: { anthropic: ["anthropic:default"] },
    },
    configAuth: {
      profiles: { "anthropic:default": { provider: "anthropic", mode: "api_key" } },
      order: { anthropic: ["anthropic:default"] },
    },
    configModel: {
      primary: "anthropic/claude-sonnet-4.6",
      models: { "anthropic/claude-sonnet-4.6": {} },
    },
    savedAt: "2026-02-25T00:00:00.000Z",
  };

  it("with backup: restores credentials, config, clears JWT, returns hasBackup true", async () => {
    storageMap.set(BACKUP_LS_KEY, JSON.stringify(savedBackup));

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "sub-jwt", email: "u@t.com", userId: "u1" }));

    const mockRequest = createMockRequest();
    const result = await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    expect(result.hasBackup).toBe(true);
    expect(store.getState().auth.mode).toBe("self-managed");
    expect(store.getState().auth.jwt).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("self-managed");
    expect(storageMap.has(BACKUP_LS_KEY)).toBe(false);

    expect(mockApi.authWriteProfiles).toHaveBeenCalledWith({
      profiles: savedBackup.credentials.profiles,
      order: savedBackup.credentials.order,
    });

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toEqual(savedBackup.configAuth.profiles);
    expect(patchBody.agents.defaults.model.primary).toBe("anthropic/claude-sonnet-4.6");
  });

  it("without backup: clears config, returns hasBackup false", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    const result = await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    expect(result.hasBackup).toBe(false);
    expect(store.getState().auth.mode).toBe("self-managed");
    expect(storageMap.get(MODE_LS_KEY)).toBe("self-managed");

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });

  it("saves paid backup before clearing auth when JWT is present", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: { "openrouter:default": { provider: "openrouter", mode: "api_key" } },
      order: { openrouter: ["openrouter:default"] },
    });

    storageMap.set(
      AUTH_TOKEN_LS_KEY,
      JSON.stringify({ jwt: "paid-jwt", email: "paid@test.com", userId: "pu1" })
    );

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "paid-jwt", email: "paid@test.com", userId: "pu1" }));

    const mockRequest = createMockRequest();
    await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    const paidBackup = JSON.parse(storageMap.get(PAID_BACKUP_LS_KEY)!);
    expect(paidBackup.authToken).toEqual({
      jwt: "paid-jwt",
      email: "paid@test.com",
      userId: "pu1",
    });
    expect(paidBackup.credentials.profiles).toHaveProperty("openrouter:default");
    expect(paidBackup.configAuth.profiles).toHaveProperty("anthropic:default");
    expect(paidBackup.configModel.primary).toBe("anthropic/claude-sonnet-4.6");
    expect(paidBackup.savedAt).toBeDefined();
  });

  it("does not save paid backup when no JWT is present", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    expect(storageMap.has(PAID_BACKUP_LS_KEY)).toBe(false);
  });

  it("does not overwrite existing paid backup on second call (idempotent)", async () => {
    mockApi.authReadProfiles.mockResolvedValue({
      profiles: { "openrouter:default": { provider: "openrouter", key: "sk-or-real" } },
      order: { openrouter: ["openrouter:default"] },
    });

    storageMap.set(
      AUTH_TOKEN_LS_KEY,
      JSON.stringify({ jwt: "jwt-first", email: "first@test.com", userId: "u1" })
    );

    const store = createTestStore();
    store.dispatch(
      authActions.setAuth({ jwt: "jwt-first", email: "first@test.com", userId: "u1" })
    );

    const mockRequest = createMockRequest();
    await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    const backupAfterFirst = JSON.parse(storageMap.get(PAID_BACKUP_LS_KEY)!);
    expect(backupAfterFirst.authToken.jwt).toBe("jwt-first");

    storageMap.set(
      AUTH_TOKEN_LS_KEY,
      JSON.stringify({ jwt: "jwt-second", email: "second@test.com", userId: "u2" })
    );
    store.dispatch(
      authActions.setAuth({ jwt: "jwt-second", email: "second@test.com", userId: "u2" })
    );

    await store.dispatch(switchToSelfManaged({ request: mockRequest })).unwrap();

    const backupAfterSecond = JSON.parse(storageMap.get(PAID_BACKUP_LS_KEY)!);
    expect(backupAfterSecond.authToken.jwt).toBe("jwt-first");
  });
});

// ── applySubscriptionKeys thunk ─────────────────────────────────────────────

describe("applySubscriptionKeys thunk", () => {
  it("fetches keys from backend and applies OpenRouter/OpenAI profiles", async () => {
    mockBackendApi.getKeys.mockResolvedValueOnce({
      openrouterApiKey: "sk-or-test-key",
      openaiApiKey: "sk-openai-test-key",
    });

    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    expect(mockBackendApi.getKeys).toHaveBeenCalledWith("jwt-tok");
    expect(mockApi.setApiKey).toHaveBeenCalledWith("openrouter", "sk-or-test-key");
    expect(mockApi.setApiKey).toHaveBeenCalledWith("openai", "sk-openai-test-key");

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles["openrouter:default"]).toEqual({
      provider: "openrouter",
      mode: "api_key",
    });
    expect(patchBody.auth.order.openrouter).toEqual(["openrouter:default"]);
    expect(patchBody.auth.profiles["openai:default"]).toEqual({
      provider: "openai",
      mode: "api_key",
    });
    expect(patchBody.auth.order.openai).toEqual(["openai:default"]);
  });

  it("does not call setApiKey when backend returns null key", async () => {
    mockBackendApi.getKeys.mockResolvedValueOnce({ openrouterApiKey: null, openaiApiKey: null });

    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    expect(mockApi.setApiKey).not.toHaveBeenCalled();
  });

  it("sets default model when no model is configured", async () => {
    const noModelSnap = {
      config: { auth: {}, agents: { defaults: { model: { primary: "" } } } },
      hash: "no-model-hash",
      exists: true,
    };
    const mockRequest = vi.fn().mockImplementation((method: string) => {
      if (method === "config.get") return Promise.resolve(noModelSnap);
      if (method === "config.patch") return Promise.resolve({ ok: true });
      return Promise.resolve({});
    });

    const store = createTestStore();
    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.agents.defaults.model.primary).toBe("openrouter/anthropic/claude-sonnet-4.6");
    expect(patchBody.agents.defaults.models).toHaveProperty(
      "openrouter/anthropic/claude-sonnet-4.6"
    );
  });

  it("does not override model when one is already configured", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();

    await store
      .dispatch(applySubscriptionKeys({ token: "jwt-tok", request: mockRequest }))
      .unwrap();

    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.agents).toBeUndefined();
  });
});

// ── handleLogout thunk ──────────────────────────────────────────────────────

describe("handleLogout thunk", () => {
  it("keeps paid mode, clears JWT, and applies subscription reset", async () => {
    const backup = {
      credentials: { profiles: {}, order: {} },
      configAuth: {},
      configModel: { primary: "openai/gpt-4o" },
      savedAt: "2026-02-25T00:00:00.000Z",
    };
    storageMap.set(BACKUP_LS_KEY, JSON.stringify(backup));

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "sub-jwt", email: "u@t.com", userId: "u1" }));

    const mockRequest = createMockRequest();
    await store.dispatch(handleLogout({ request: mockRequest })).unwrap();

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
    expect(store.getState().auth.email).toBeNull();
    expect(store.getState().auth.userId).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");

    expect(mockRequest).toHaveBeenCalledWith("config.get", {});
    const patchCall = mockRequest.mock.calls.find((c: unknown[]) => c[0] === "config.patch");
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].raw);
    expect(patchBody.auth.profiles).toBeNull();
    expect(patchBody.auth.order).toBeNull();
    expect(patchBody.agents.defaults.model.primary).toBe("");
  });

  it("creates backup when missing and remains in paid mode", async () => {
    const store = createTestStore();
    const mockRequest = createMockRequest();
    await store.dispatch(handleLogout({ request: mockRequest })).unwrap();

    expect(store.getState().auth.mode).toBe("paid");
    expect(store.getState().auth.jwt).toBeNull();
    expect(storageMap.get(MODE_LS_KEY)).toBe("paid");
    expect(storageMap.get(BACKUP_LS_KEY)).toBeDefined();
  });

  it("clears paid backup on logout", async () => {
    const paidBackup = {
      authToken: { jwt: "paid-jwt", email: "paid@test.com", userId: "pu1" },
      credentials: { profiles: {}, order: {} },
      configAuth: {},
      configModel: {},
      savedAt: "2026-03-01T00:00:00.000Z",
    };
    storageMap.set(PAID_BACKUP_LS_KEY, JSON.stringify(paidBackup));

    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "sub-jwt", email: "u@t.com", userId: "u1" }));

    const mockRequest = createMockRequest();
    await store.dispatch(handleLogout({ request: mockRequest })).unwrap();

    expect(storageMap.has(PAID_BACKUP_LS_KEY)).toBe(false);
    expect(store.getState().auth.jwt).toBeNull();
  });
});

// ── createAddonCheckout thunk ────────────────────────────────────────────────

describe("createAddonCheckout thunk", () => {
  it("creates checkout url when authenticated", async () => {
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "jwt-tok", email: "u@t.com", userId: "u1" }));

    const result = await store.dispatch(createAddonCheckout({ amountUsd: 25 })).unwrap();

    expect(result).toEqual({ checkoutUrl: "https://stripe.test/checkout" });
    expect(mockBackendApi.createAddonCheckout).toHaveBeenCalledWith("jwt-tok", {
      amountUsd: 25,
      successUrl: "atomicbot://addon-success",
      cancelUrl: "atomicbot://addon-cancel",
    });
    expect(store.getState().auth.topUpPending).toBe(false);
    expect(store.getState().auth.topUpError).toBeNull();
  });

  it("fails without JWT and stores top-up error", async () => {
    const store = createTestStore();

    await expect(store.dispatch(createAddonCheckout({ amountUsd: 10 })).unwrap()).rejects.toThrow(
      "Not authenticated"
    );

    expect(mockBackendApi.createAddonCheckout).not.toHaveBeenCalled();
    expect(store.getState().auth.topUpPending).toBe(false);
    expect(store.getState().auth.topUpError).toBe("Not authenticated");
  });

  it("sets pending state on pending action", () => {
    const state = authReducer(undefined, createAddonCheckout.pending("req", { amountUsd: 12 }));
    expect(state.topUpPending).toBe(true);
    expect(state.topUpError).toBeNull();
  });
});

describe("auto top-up thunks", () => {
  it("fetchAutoTopUpSettings loads data from backend", async () => {
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "jwt-tok", email: "u@t.com", userId: "u1" }));

    await store.dispatch(fetchAutoTopUpSettings()).unwrap();

    expect(mockBackendApi.getAutoTopUpSettings).toHaveBeenCalledWith("jwt-tok");
    expect(store.getState().auth.autoTopUp.enabled).toBe(true);
    expect(store.getState().auth.autoTopUp.currentMonthSpentUsd).toBe(42);
    expect(store.getState().auth.autoTopUpLoaded).toBe(true);
    expect(store.getState().auth.autoTopUpError).toBeNull();
  });

  it("fetchAutoTopUpSettings falls back to defaults on backend error", async () => {
    mockBackendApi.getAutoTopUpSettings.mockRejectedValueOnce(new Error("boom"));
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "jwt-tok", email: "u@t.com", userId: "u1" }));

    await expect(store.dispatch(fetchAutoTopUpSettings()).unwrap()).rejects.toThrow("boom");

    expect(store.getState().auth.autoTopUp).toEqual(DEFAULT_AUTO_TOP_UP_SETTINGS);
    expect(store.getState().auth.autoTopUpLoaded).toBe(true);
    expect(store.getState().auth.autoTopUpError).toBe("boom");
  });

  it("patchAutoTopUpSettings sends merged payload and stores response", async () => {
    const store = createTestStore();
    store.dispatch(authActions.setAuth({ jwt: "jwt-tok", email: "u@t.com", userId: "u1" }));

    await store.dispatch(
      patchAutoTopUpSettings({
        enabled: false,
        thresholdUsd: 3,
        topupAmountUsd: 15,
        monthlyCapUsd: 200,
      })
    );

    expect(mockBackendApi.updateAutoTopUpSettings).toHaveBeenCalledWith("jwt-tok", {
      enabled: false,
      thresholdUsd: 3,
      topupAmountUsd: 15,
      monthlyCapUsd: 200,
    });
    expect(store.getState().auth.autoTopUp.enabled).toBe(false);
    expect(store.getState().auth.autoTopUp.thresholdUsd).toBe(3);
    expect(store.getState().auth.autoTopUpSaving).toBe(false);
  });

  it("clearAuthState resets auto top-up state", () => {
    const withCustomAutoTopUp: AuthSliceState = {
      ...authReducer(undefined, { type: "@@INIT" }),
      autoTopUp: {
        enabled: false,
        thresholdUsd: 8,
        topupAmountUsd: 25,
        monthlyCapUsd: 90,
        hasPaymentMethod: true,
        currentMonthSpentUsd: 14,
      },
      autoTopUpLoaded: true,
      autoTopUpError: "failed",
    };

    const state = authReducer(withCustomAutoTopUp, authActions.clearAuthState());
    expect(state.autoTopUp).toEqual(DEFAULT_AUTO_TOP_UP_SETTINGS);
    expect(state.autoTopUpLoaded).toBe(false);
    expect(state.autoTopUpError).toBeNull();
  });
});
