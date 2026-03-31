/**
 * ModeHandler for the "local-model" mode.
 * Manages the local llama-server lifecycle and llamacpp gateway config.
 */
import type { ModeHandler, SwitchContext, ModeSetupResult } from "./mode-switch";
import { clearGatewayAuth } from "./mode-switch-utils";
import {
  readLocalModelBackup,
  saveLocalModelBackup,
  clearLocalModelBackup,
} from "./auth-persistence";
import { llamacppActions, stopLlamacppServer, startLlamacppServer } from "../llamacppSlice";
import { applyLocalModelConfig } from "../llamacpp-config";

export const localModelHandler: ModeHandler = {
  async saveBackup(ctx: SwitchContext): Promise<void> {
    const activeModelId = ctx.getState().llamacpp.activeModelId;
    if (activeModelId) {
      saveLocalModelBackup({
        activeModelId,
        savedAt: new Date().toISOString(),
      });
    }
  },

  async teardown(ctx: SwitchContext): Promise<void> {
    try {
      await ctx.dispatch(stopLlamacppServer()).unwrap();
    } catch {
      // server might already be stopped
    }

    try {
      await ctx.api?.llamacppClearActiveModel?.();
    } catch {
      // active model file cleanup is best effort
    }

    try {
      await ctx.api?.setSetupModeMarker?.();
    } catch {
      // setup mode marker cleanup is best effort
    }

    ctx.dispatch(llamacppActions.setActiveModelId(null));
    ctx.dispatch(llamacppActions.setServerStatus("stopped"));

    await clearGatewayAuth(
      ctx.api,
      ctx.request,
      { models: { providers: { llamacpp: null } } },
      "Switch from local-model: clear llamacpp config"
    );
  },

  async setup(ctx: SwitchContext): Promise<ModeSetupResult> {
    let { modelId, modelName, contextLength } = ctx.extra;
    const backup = readLocalModelBackup();

    if (!modelId && backup?.activeModelId) {
      try {
        const serverResult = await ctx.dispatch(startLlamacppServer(backup.activeModelId)).unwrap();
        modelId = serverResult?.modelId ?? backup.activeModelId;
        modelName = serverResult?.modelName ?? modelName;
        contextLength = serverResult?.contextLength ?? contextLength;
      } catch {
        // Server start is best effort on mode restore.
      }
    }

    const cfgModelId = modelId ?? backup?.activeModelId ?? "local-model";
    const cfgModelName = modelName ?? "Local Model";

    if (ctx.api?.setApiKey) {
      try {
        await ctx.api.setApiKey("llamacpp", "LLAMACPP_LOCAL_KEY");
      } catch (err) {
        console.warn("[localModelHandler] Failed to set llamacpp API key:", err);
      }
    }

    try {
      await applyLocalModelConfig({
        request: ctx.request,
        modelId: cfgModelId,
        modelName: cfgModelName,
        contextLength,
      });
    } catch (err) {
      console.warn("[localModelHandler] Failed to patch config:", err);
    }

    clearLocalModelBackup();
    return { hasBackup: !!backup, restoredModel: `llamacpp/${cfgModelId}` };
  },
};
