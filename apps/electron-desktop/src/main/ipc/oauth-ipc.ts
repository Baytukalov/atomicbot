/**
 * IPC handlers for OAuth-based model provider login.
 *
 * Drives the full OAuth lifecycle in the Electron main process:
 *   1. Resolves the provider via `getOAuthProvider(id)` from @mariozechner/pi-ai.
 *   2. Calls `provider.login(callbacks)` which spawns a localhost callback server.
 *   3. Opens the auth URL in the system browser via `shell.openExternal`.
 *   4. Sends progress events to the renderer via IPC.
 *   5. Persists credentials to auth-profiles.json.
 *   6. Returns { ok, profileId } to the renderer.
 *
 * Generic — any provider registered with pi-ai works without extra code.
 */
import { ipcMain, shell } from "electron";

import { upsertOAuthProfile } from "../keys/authProfilesStore";
import type { OAuthHandlerParams } from "./types";

export function registerOAuthHandlers(params: OAuthHandlerParams) {
  ipcMain.handle("oauth:login", async (_evt, p: { provider?: unknown }) => {
    const providerId = typeof p?.provider === "string" ? p.provider.trim() : "";
    if (!providerId) {
      throw new Error("provider is required");
    }

    // Dynamic import so we don't block Electron startup with pi-ai init.
    const { getOAuthProvider } = await import("@mariozechner/pi-ai");
    const oauthProvider = getOAuthProvider(providerId);
    if (!oauthProvider) {
      throw new Error(
        `unsupported OAuth provider: ${providerId}. ` +
          `Make sure it is registered with @mariozechner/pi-ai.`
      );
    }

    const mainWindow = params.getMainWindow();

    const credentials = await oauthProvider.login({
      onAuth: ({ url }) => {
        // Open the consent page directly from main process.
        void shell.openExternal(url);
      },
      onPrompt: async () => {
        // Manual code paste is not supported in the desktop app.
        // The localhost callback server handles the redirect automatically.
        throw new Error("Manual OAuth code input is not supported in the desktop app");
      },
      onProgress: (message) => {
        // Push progress to renderer so the UI can update status text.
        mainWindow?.webContents.send("oauth:progress", { provider: providerId, message });
      },
    });

    // Persist full OAuth credentials (tokens, expiry, email, etc.)
    // to auth-profiles.json so the gateway can authenticate API requests.
    const { profileId } = upsertOAuthProfile({
      stateDir: params.stateDir,
      provider: providerId,
      credentials: credentials as unknown as Record<string, unknown>,
    });

    return { ok: true, profileId } as const;
  });
}
