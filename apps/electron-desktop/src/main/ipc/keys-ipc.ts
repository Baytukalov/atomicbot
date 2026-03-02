/**
 * IPC handlers for API key management and auth profiles.
 */
import { ipcMain } from "electron";

import { upsertApiKeyProfile, upsertTokenProfile } from "../keys/apiKeys";
import {
  readAuthProfilesStore,
  resolveAuthProfilesPath,
  writeAuthProfilesStoreAtomic,
} from "../keys/authProfilesStore";
import type { AuthProfilesStore } from "../keys/authProfilesStore";
import type { KeyHandlerParams } from "./types";

export function registerKeyHandlers(params: KeyHandlerParams) {
  ipcMain.handle("auth-set-api-key", async (_evt, p: { provider?: unknown; apiKey?: unknown }) => {
    const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
    const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
    if (!provider) {
      throw new Error("provider is required");
    }
    upsertApiKeyProfile({
      stateDir: params.stateDir,
      provider,
      key: apiKey,
      profileName: "default",
    });
    return { ok: true } as const;
  });

  ipcMain.handle(
    "auth-validate-api-key",
    async (_evt, p: { provider?: unknown; apiKey?: unknown }) => {
      const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
      const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
      if (!provider) {
        return { valid: false, error: "provider is required" };
      }
      if (!apiKey) {
        return { valid: false, error: "API key is required" };
      }
      const { validateProviderApiKey } = await import("../keys/validateApiKey");
      return validateProviderApiKey(provider, apiKey);
    }
  );

  ipcMain.handle(
    "auth-set-setup-token",
    async (_evt, p: { provider?: unknown; token?: unknown }) => {
      const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
      const token = typeof p?.token === "string" ? p.token : "";
      if (!provider) {
        throw new Error("provider is required");
      }
      upsertTokenProfile({
        stateDir: params.stateDir,
        provider,
        token,
        profileName: "default",
      });
      return { ok: true } as const;
    }
  );

  ipcMain.handle("auth-has-api-key", async (_evt, p: { provider?: unknown }) => {
    const provider = typeof p?.provider === "string" ? p.provider.trim().toLowerCase() : "";
    if (!provider) {
      throw new Error("provider is required");
    }
    const authProfilesPath = resolveAuthProfilesPath({ stateDir: params.stateDir });
    const store = readAuthProfilesStore({ authProfilesPath });
    const configured = Object.values(store.profiles).some(
      (profile) =>
        (profile.type === "api_key" &&
          profile.provider === provider &&
          profile.key.trim().length > 0) ||
        (profile.type === "token" &&
          profile.provider === provider &&
          profile.token.trim().length > 0) ||
        (profile.type === "oauth" && profile.provider === provider)
    );
    return { configured } as const;
  });

  ipcMain.handle("auth-read-profiles", async () => {
    const authProfilesPath = resolveAuthProfilesPath({ stateDir: params.stateDir });
    const store = readAuthProfilesStore({ authProfilesPath });
    return { profiles: store.profiles, order: store.order } as const;
  });

  ipcMain.handle(
    "auth-write-profiles",
    async (_evt, p: { profiles?: unknown; order?: unknown }) => {
      const authProfilesPath = resolveAuthProfilesPath({ stateDir: params.stateDir });
      const profiles =
        p?.profiles && typeof p.profiles === "object" && !Array.isArray(p.profiles)
          ? (p.profiles as AuthProfilesStore["profiles"])
          : {};
      const order =
        p?.order && typeof p.order === "object" && !Array.isArray(p.order)
          ? (p.order as AuthProfilesStore["order"])
          : {};
      writeAuthProfilesStoreAtomic({
        authProfilesPath,
        store: { version: 1, profiles, order },
      });
      return { ok: true } as const;
    }
  );
}
