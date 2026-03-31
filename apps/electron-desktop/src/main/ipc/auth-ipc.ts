/**
 * Auth tokens are stored in renderer localStorage, but setup mode needs a
 * main-readable marker for bootstrap-time decisions.
 */
import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { clearOnboardedState, writeOnboardedState } from "../onboarding-state";
import { clearSetupMode, writeSetupMode } from "../setup-mode-state";
import type { AuthHandlerParams } from "./types";

export function registerAuthHandlers(params: AuthHandlerParams) {
  ipcMain.handle(IPC.onboardingSetState, (_evt, payload: { onboarded?: boolean }) => {
    console.log("[auth-ipc] onboardingSetState:", payload);
    if (payload.onboarded) {
      writeOnboardedState(params.stateDir, true);
    } else {
      clearOnboardedState(params.stateDir);
    }
    return { ok: true } as const;
  });

  ipcMain.handle(IPC.authSetSetupModeMarker, (_evt, payload?: { mode?: string }) => {
    console.log("[auth-ipc] setSetupModeMarker:", payload?.mode ?? "clear");
    if (!payload?.mode) {
      clearSetupMode(params.stateDir);
      return { ok: true } as const;
    }

    if (
      payload.mode !== "paid" &&
      payload.mode !== "self-managed" &&
      payload.mode !== "local-model"
    ) {
      console.error("[auth-ipc] invalid setup mode:", payload.mode);
      throw new Error(`Invalid setup mode marker: ${payload.mode}`);
    }

    writeSetupMode(params.stateDir, payload.mode);
    return { ok: true } as const;
  });
}
