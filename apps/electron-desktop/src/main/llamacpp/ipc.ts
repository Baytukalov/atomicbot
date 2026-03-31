import { app, ipcMain } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

import { IPC, IPC_EVENTS } from "../../shared/ipc-channels";
import type { LlamacppHandlerParams } from "../ipc/types";
import { downloadFile } from "../whisper/download";
import { getSystemInfo, getModelCompatibility, computeContextLength } from "./hardware";
import {
  LLAMACPP_MODELS,
  getLlamacppModelDef,
  resolveLlamacppModelPath,
  resolveChatTemplatePath,
  type LlamacppModelId,
} from "./models";
import { clearActiveModelId, readActiveModelId, writeActiveModelId } from "./model-state";
import {
  downloadBackend,
  isBackendDownloaded,
  readBackendVersion,
  checkForBackendUpdate,
  resolveServerBinPath,
} from "./backend-download";
import { startLlamacppServer, stopLlamacppServer, getLlamacppServerStatus } from "./server";

export function registerLlamacppIpcHandlers(params: LlamacppHandlerParams): void {
  const { llamacppDataDir, stateDir } = params;

  let backendAbort: AbortController | null = null;
  let modelAbort: AbortController | null = null;

  ipcMain.handle(IPC.llamacppSystemInfo, () => {
    const sysInfo = getSystemInfo();
    const models = LLAMACPP_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      compatibility: getModelCompatibility(m, sysInfo),
    }));
    return { ...sysInfo, models };
  });

  ipcMain.handle(IPC.llamacppBackendStatus, async () => {
    const downloaded = isBackendDownloaded(llamacppDataDir);
    const version = readBackendVersion(llamacppDataDir);
    return {
      downloaded,
      version: version?.tag ?? null,
      downloadedAt: version?.downloadedAt ?? null,
    };
  });

  ipcMain.handle(IPC.llamacppBackendDownload, async () => {
    backendAbort?.abort();
    const abort = new AbortController();
    backendAbort = abort;

    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.llamacppBackendDownloadProgress, {
            percent,
            transferred,
            total,
          });
        }
      };

      const result = await downloadBackend(llamacppDataDir, {
        onProgress: sendProgress,
        signal: abort.signal,
      });
      backendAbort = null;
      return { ok: true, tag: result.tag };
    } catch (err) {
      backendAbort = null;
      if (abort.signal.aborted) return { ok: false, error: "cancelled" };
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppBackendDownloadCancel, () => {
    if (backendAbort) {
      backendAbort.abort();
      backendAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.llamacppBackendUpdate, async () => {
    try {
      const result = await checkForBackendUpdate(llamacppDataDir);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppModelStatus, (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : "llama-3.2-3b") as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
    const exists = fs.existsSync(modelPath);
    let size = 0;
    if (exists) {
      try {
        size = fs.statSync(modelPath).size;
      } catch {
        // ignore
      }
    }
    return {
      downloaded: exists && size > 0,
      modelPath,
      size,
      modelId: model.id,
    };
  });

  ipcMain.handle(IPC.llamacppModelDownload, async (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : "llama-3.2-3b") as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });

    modelAbort?.abort();
    const abort = new AbortController();
    modelAbort = abort;

    console.log(`[llamacpp] downloading model ${modelId}: ${model.huggingFaceUrl} → ${modelPath}`);

    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.llamacppModelDownloadProgress, {
            percent,
            transferred,
            total,
            modelId,
          });
        }
      };

      await downloadFile(model.huggingFaceUrl, modelPath, {
        onProgress: sendProgress,
        userAgent: "openclaw-electron-desktop/llamacpp-model-download",
        signal: abort.signal,
      });
      modelAbort = null;

      const stat = fs.statSync(modelPath);
      console.log(`[llamacpp] model ${modelId} downloaded: ${stat.size} bytes`);
      return { ok: true, modelPath };
    } catch (err) {
      modelAbort = null;
      console.error(`[llamacpp] model download failed: ${String(err)}`);
      if (abort.signal.aborted) return { ok: false, error: "cancelled" };
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppModelDownloadCancel, () => {
    if (modelAbort) {
      modelAbort.abort();
      modelAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.llamacppModelsList, () => {
    const sysInfo = getSystemInfo();
    return LLAMACPP_MODELS.map((m) => {
      const modelPath = resolveLlamacppModelPath(llamacppDataDir, m);
      const exists = fs.existsSync(modelPath);
      let size = 0;
      if (exists) {
        try {
          size = fs.statSync(modelPath).size;
        } catch {
          // ignore
        }
      }
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        sizeLabel: m.sizeLabel,
        contextLabel: m.contextLabel,
        downloaded: exists && size > 0,
        size,
        compatibility: getModelCompatibility(m, sysInfo),
        icon: m.icon,
      };
    });
  });

  ipcMain.handle(IPC.llamacppServerStart, async (_evt, p?: { model?: string }) => {
    const modelId = (
      typeof p?.model === "string" ? p.model : (readActiveModelId(stateDir) ?? "llama-3.2-3b")
    ) as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);

    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: `Model not downloaded: ${model.name}` };
    }

    const binPath = resolveServerBinPath(llamacppDataDir);
    if (!fs.existsSync(binPath)) {
      return { ok: false, error: "llama-server backend not downloaded" };
    }

    try {
      const sysInfo = getSystemInfo();
      const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
      console.log(
        `[llamacpp] computed context length: ${ctxLen} (RAM=${sysInfo.totalRamGb}GB, model=${model.fileSizeGb}GB)`
      );
      const chatTemplateFile = resolveChatTemplatePath(model, {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
      });
      console.log(`[llamacpp] chat template: ${chatTemplateFile ?? "none (using GGUF built-in)"}`);
      const { port } = await startLlamacppServer(binPath, modelPath, {
        contextLength: ctxLen,
        modelId,
        chatTemplateFile,
      });
      writeActiveModelId(stateDir, modelId);
      return { ok: true, port, modelId, modelName: model.name, contextLength: ctxLen };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppServerStop, async () => {
    try {
      await stopLlamacppServer();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppClearActiveModel, async () => {
    try {
      clearActiveModelId(stateDir);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC.llamacppServerStatus, () => {
    const status = getLlamacppServerStatus();
    const activeModelId = readActiveModelId(stateDir);
    return { ...status, activeModelId };
  });

  ipcMain.handle(IPC.llamacppSetActiveModel, async (_evt, p: { model: string }) => {
    const modelId = p.model as LlamacppModelId;
    const model = getLlamacppModelDef(modelId);
    const modelPath = resolveLlamacppModelPath(llamacppDataDir, model);

    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: `Model not downloaded: ${model.name}` };
    }

    const binPath = resolveServerBinPath(llamacppDataDir);
    if (!fs.existsSync(binPath)) {
      return { ok: false, error: "llama-server backend not downloaded" };
    }

    try {
      writeActiveModelId(stateDir, modelId);
      const sysInfo = getSystemInfo();
      const ctxLen = computeContextLength(sysInfo.totalRamGb, model);
      console.log(
        `[llamacpp] computed context length: ${ctxLen} (RAM=${sysInfo.totalRamGb}GB, model=${model.fileSizeGb}GB)`
      );
      const chatTemplateFile = resolveChatTemplatePath(model, {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
      });
      const { port } = await startLlamacppServer(binPath, modelPath, {
        contextLength: ctxLen,
        modelId,
        chatTemplateFile,
      });
      return { ok: true, port, modelId, modelName: model.name, contextLength: ctxLen };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
