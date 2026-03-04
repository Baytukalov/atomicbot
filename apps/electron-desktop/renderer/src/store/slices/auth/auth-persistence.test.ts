/**
 * Tests for auth-persistence — localStorage helpers extracted from authSlice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearBackup,
  clearPaidBackup,
  clearPersistedAuthToken,
  persistAuthToken,
  persistMode,
  readBackup,
  readPaidBackup,
  readPersistedAuthToken,
  readPersistedMode,
  saveBackup,
  savePaidBackup,
} from "./auth-persistence";

// ── localStorage shim ───────────────────────────────────────────────────────

const storageMap = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

beforeEach(() => {
  storageMap.clear();
  // @ts-expect-error - shimming localStorage for node env
  globalThis.localStorage = localStorageShim;
});

// ── persistMode / readPersistedMode ─────────────────────────────────────────

describe("persistMode / readPersistedMode", () => {
  it("persists and reads 'paid' mode", () => {
    persistMode("paid");
    expect(readPersistedMode()).toBe("paid");
  });

  it("persists and reads 'self-managed' mode", () => {
    persistMode("self-managed");
    expect(readPersistedMode()).toBe("self-managed");
  });

  it("returns null when no mode is persisted", () => {
    expect(readPersistedMode()).toBeNull();
  });

  it("returns null for invalid mode value", () => {
    storageMap.set("openclaw-desktop-mode", "invalid");
    expect(readPersistedMode()).toBeNull();
  });
});

// ── persistAuthToken / readPersistedAuthToken / clearPersistedAuthToken ──────

describe("persistAuthToken / readPersistedAuthToken / clearPersistedAuthToken", () => {
  it("persists and reads auth token", () => {
    persistAuthToken({ jwt: "test-jwt", email: "a@b.com", userId: "u1" });
    const result = readPersistedAuthToken();
    expect(result).toEqual({ jwt: "test-jwt", email: "a@b.com", userId: "u1" });
  });

  it("returns null when no token is persisted", () => {
    expect(readPersistedAuthToken()).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    storageMap.set("openclaw-auth-token", "not-json");
    expect(readPersistedAuthToken()).toBeNull();
  });

  it("returns null for JSON without jwt field", () => {
    storageMap.set("openclaw-auth-token", JSON.stringify({ email: "a@b.com" }));
    expect(readPersistedAuthToken()).toBeNull();
  });

  it("clears persisted token", () => {
    persistAuthToken({ jwt: "tok", email: "a@b.com", userId: "u1" });
    clearPersistedAuthToken();
    expect(readPersistedAuthToken()).toBeNull();
  });
});

// ── saveBackup / readBackup / clearBackup ───────────────────────────────────

describe("saveBackup / readBackup / clearBackup", () => {
  const backup = {
    credentials: {
      profiles: { "anthropic:default": { key: "sk-ant-xxx" } },
      order: { anthropic: ["anthropic:default"] },
    },
    configAuth: { profiles: { "anthropic:default": { provider: "anthropic" } } },
    configModel: { primary: "anthropic/claude-sonnet-4.6" },
    savedAt: "2026-01-01T00:00:00.000Z",
  };

  it("saves and reads backup", () => {
    saveBackup(backup);
    expect(readBackup()).toEqual(backup);
  });

  it("returns null when no backup exists", () => {
    expect(readBackup()).toBeNull();
  });

  it("returns null for invalid JSON backup", () => {
    storageMap.set("openclaw-self-managed-backup", "bad-json");
    expect(readBackup()).toBeNull();
  });

  it("clears backup", () => {
    saveBackup(backup);
    clearBackup();
    expect(readBackup()).toBeNull();
  });
});

// ── savePaidBackup / readPaidBackup / clearPaidBackup ────────────────────────

describe("savePaidBackup / readPaidBackup / clearPaidBackup", () => {
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
    configModel: { primary: "openrouter/anthropic/claude-sonnet-4.6" },
    savedAt: "2026-03-01T00:00:00.000Z",
  };

  it("saves and reads paid backup", () => {
    savePaidBackup(paidBackup);
    expect(readPaidBackup()).toEqual(paidBackup);
  });

  it("returns null when no paid backup exists", () => {
    expect(readPaidBackup()).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    storageMap.set("openclaw-paid-backup", "bad-json");
    expect(readPaidBackup()).toBeNull();
  });

  it("returns null when authToken.jwt is missing", () => {
    storageMap.set(
      "openclaw-paid-backup",
      JSON.stringify({ authToken: { email: "a@b.com" }, credentials: {} })
    );
    expect(readPaidBackup()).toBeNull();
  });

  it("clears paid backup", () => {
    savePaidBackup(paidBackup);
    clearPaidBackup();
    expect(readPaidBackup()).toBeNull();
  });
});
