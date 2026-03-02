import { ipcMain, type BrowserWindow } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { writeSelectedWhisperModel } from "./model-state";
import { getPlatform } from "../platform";

export type WhisperModelId = "small" | "large-v3-turbo-q8" | "large-v3-turbo";

export interface WhisperModelDef {
  id: WhisperModelId;
  filename: string;
  url: string;
  label: string;
  description: string;
  sizeLabel: string;
}

export const WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "small",
    filename: "ggml-small.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    label: "Small",
    description: "Fast, lower resource usage",
    sizeLabel: "~465 MB",
  },
  {
    id: "large-v3-turbo-q8",
    filename: "ggml-large-v3-turbo-q8_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin",
    label: "Medium",
    description: "Near-best accuracy, quantized for lower memory",
    sizeLabel: "~874 MB",
  },
  {
    id: "large-v3-turbo",
    filename: "ggml-large-v3-turbo.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    label: "Large",
    description: "Best accuracy, high resource usage",
    sizeLabel: "~1.6 GB",
  },
];

export const DEFAULT_MODEL_ID: WhisperModelId = "small";

export function getModelDef(id: WhisperModelId): WhisperModelDef {
  return WHISPER_MODELS.find((m) => m.id === id) ?? WHISPER_MODELS[0]!;
}

/**
 * Model is stored in a persistent `models/` subdirectory inside the whisper
 * data directory (userData/whisper) so it survives app updates.
 */
export function resolveModelPath(whisperDataDir: string, model: WhisperModelDef): string {
  return path.join(whisperDataDir, "models", model.filename);
}

/** ffmpeg binary lives inside the persistent whisper data directory. */
export function resolveFfmpegPath(whisperDataDir: string): string {
  return path.join(whisperDataDir, getPlatform().ffmpegBinaryName());
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

async function downloadFile(
  url: string,
  destPath: string,
  opts?: {
    onProgress?: (percent: number, transferred: number, total: number) => void;
    userAgent?: string;
    signal?: AbortSignal;
  }
): Promise<void> {
  const headers: Record<string, string> = {
    "User-Agent": opts?.userAgent ?? "openclaw-electron-desktop",
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, redirect: "follow", signal: opts?.signal });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }

  const totalRaw = res.headers.get("content-length");
  const total = totalRaw ? parseInt(totalRaw, 10) : 0;
  let transferred = 0;

  const reader = res.body.getReader();
  const trackingStream = new ReadableStream({
    async pull(controller) {
      if (opts?.signal?.aborted) {
        await reader.cancel();
        controller.close();
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      transferred += value.byteLength;
      const percent = total > 0 ? Math.round((transferred / total) * 100) : 0;
      opts?.onProgress?.(percent, transferred, total);
      controller.enqueue(value);
    },
  });

  const nodeReadable = Readable.fromWeb(trackingStream as import("node:stream/web").ReadableStream);
  const tmpPath = `${destPath}.tmp`;
  try {
    const writeStream = fs.createWriteStream(tmpPath);
    await pipeline(nodeReadable, writeStream);
    fs.renameSync(tmpPath, destPath);
  } finally {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Download and extract ffmpeg if not already present in the whisper data dir.
 * Returns the path to the ffmpeg binary.
 */
async function ensureFfmpeg(whisperDataDir: string): Promise<string> {
  const platform = getPlatform();
  const ffmpegPath = resolveFfmpegPath(whisperDataDir);
  if (fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  const downloadUrl = platform.ffmpegDownloadUrl();
  if (!downloadUrl) {
    throw new Error(`ffmpeg download not available for platform: ${platform.name}`);
  }

  console.log("[whisper] ffmpeg not found, downloading…");
  ensureDir(whisperDataDir);

  const zipPath = path.join(whisperDataDir, "ffmpeg-download.zip");
  try {
    await downloadFile(downloadUrl, zipPath);

    const extractDir = path.join(whisperDataDir, "_ffmpeg_extract");
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    ensureDir(extractDir);

    platform.extractZip(zipPath, extractDir);

    const extractedBin = path.join(extractDir, platform.ffmpegBinaryName());
    if (!fs.existsSync(extractedBin)) {
      throw new Error(`ffmpeg binary not found in extracted archive`);
    }

    fs.copyFileSync(extractedBin, ffmpegPath);
    platform.makeExecutable(ffmpegPath);
    platform.removeQuarantine(ffmpegPath);

    // Cleanup
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {
      /* ignore */
    }

    console.log(`[whisper] ffmpeg installed at: ${ffmpegPath}`);
    return ffmpegPath;
  } catch (err) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function registerWhisperIpcHandlers(params: {
  whisperCliBin: string;
  whisperDataDir: string;
  getMainWindow: () => BrowserWindow | null;
  stateDir: string;
  stopGatewayChild: () => Promise<void>;
  startGateway: (opts?: { silent?: boolean }) => Promise<void>;
}): void {
  const { whisperCliBin, whisperDataDir } = params;

  let downloadAbort: AbortController | null = null;

  ipcMain.handle("whisper-model-status", (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
    const model = getModelDef(modelId);
    const modelPath = resolveModelPath(whisperDataDir, model);
    const exists = fs.existsSync(modelPath);
    let size = 0;
    if (exists) {
      try {
        size = fs.statSync(modelPath).size;
      } catch {
        // ignore
      }
    }
    const binExists = fs.existsSync(whisperCliBin);
    const ffmpegPath = resolveFfmpegPath(whisperDataDir);
    const ffmpegReady = fs.existsSync(ffmpegPath);
    return {
      modelReady: exists && size > 0,
      binReady: binExists,
      ffmpegReady,
      modelPath,
      size,
      modelId: model.id,
    };
  });

  ipcMain.handle("whisper-model-download", async (_evt, p?: { model?: string }) => {
    const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
    const model = getModelDef(modelId);
    const modelPath = resolveModelPath(whisperDataDir, model);
    ensureDir(path.dirname(modelPath));

    downloadAbort?.abort();
    const abort = new AbortController();
    downloadAbort = abort;

    try {
      // Step 1: ensure ffmpeg is available before downloading the model
      await ensureFfmpeg(whisperDataDir);
    } catch (err) {
      downloadAbort = null;
      return { ok: false, error: `Failed to download ffmpeg: ${String(err)}` };
    }

    // Step 2: download the whisper model
    try {
      const sendProgress = (percent: number, transferred: number, total: number) => {
        const win = params.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("whisper-model-download-progress", { percent, transferred, total });
        }
      };

      await downloadFile(model.url, modelPath, {
        onProgress: sendProgress,
        userAgent: "openclaw-electron-desktop/whisper-model-download",
        signal: abort.signal,
      });

      downloadAbort = null;
      return { ok: true, modelPath };
    } catch (err) {
      downloadAbort = null;
      if (abort.signal.aborted) {
        return { ok: false, error: "cancelled" };
      }
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("whisper-model-download-cancel", () => {
    if (downloadAbort) {
      downloadAbort.abort();
      downloadAbort = null;
    }
    return { ok: true };
  });

  ipcMain.handle("whisper-models-list", () => {
    const ffmpegPath = resolveFfmpegPath(whisperDataDir);
    const ffmpegReady = fs.existsSync(ffmpegPath);
    return WHISPER_MODELS.map((m) => {
      const modelPath = resolveModelPath(whisperDataDir, m);
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
        label: m.label,
        description: m.description,
        sizeLabel: m.sizeLabel,
        downloaded: exists && size > 0,
        ffmpegReady,
        size,
      };
    });
  });

  ipcMain.handle(
    "whisper-transcribe",
    async (_evt, p: { audio?: string; language?: string; model?: string }) => {
      const audioBase64 = typeof p?.audio === "string" ? p.audio : "";
      if (!audioBase64) {
        return { ok: false, error: "No audio data provided" };
      }

      if (!fs.existsSync(whisperCliBin)) {
        return { ok: false, error: `whisper-cli binary not found at: ${whisperCliBin}` };
      }

      const modelId = (typeof p?.model === "string" ? p.model : DEFAULT_MODEL_ID) as WhisperModelId;
      const model = getModelDef(modelId);
      const modelPath = resolveModelPath(whisperDataDir, model);
      if (!fs.existsSync(modelPath)) {
        return {
          ok: false,
          error: "Whisper model not downloaded. Please download it in Settings → Voice.",
        };
      }

      const tmpDir = path.join(os.tmpdir(), "openclaw-whisper");
      ensureDir(tmpDir);
      const timestamp = Date.now();
      const wavPath = path.join(tmpDir, `voice-${timestamp}.wav`);
      const outputBase = path.join(tmpDir, `voice-${timestamp}`);
      const outputTxtPath = `${outputBase}.txt`;

      try {
        const buffer = Buffer.from(audioBase64, "base64");
        fs.writeFileSync(wavPath, buffer);

        const args = ["-m", modelPath, "-otxt", "-of", outputBase, "-np", "-nt"];

        const language =
          typeof p?.language === "string" && p.language.trim() ? p.language.trim() : "auto";
        args.push("-l", language);

        args.push(wavPath);

        console.log("[whisper] spawn:", whisperCliBin, args.join(" "));
        const startMs = Date.now();

        const {
          text,
          stdout: cliStdout,
          stderr: cliStderr,
        } = await new Promise<{
          text: string;
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          const child = spawn(whisperCliBin, args, {
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 120_000,
          });

          let stdoutBuf = "";
          let stderrBuf = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            stdoutBuf += chunk.toString("utf-8");
          });
          child.stderr?.on("data", (chunk: Buffer) => {
            stderrBuf += chunk.toString("utf-8");
          });

          child.on("close", (code) => {
            if (code !== 0) {
              reject(new Error(`whisper-cli exited with code ${code}: ${stderrBuf.trim()}`));
              return;
            }

            try {
              const raw = fs.readFileSync(outputTxtPath, "utf-8").trim();
              const txt = /^\[BLANK_AUDIO\]$/i.test(raw) ? "" : raw;
              resolve({ text: txt, stdout: stdoutBuf, stderr: stderrBuf });
            } catch (readErr) {
              reject(new Error(`Failed to read whisper output: ${String(readErr)}`));
            }
          });

          child.on("error", (err) => {
            reject(new Error(`Failed to spawn whisper-cli: ${String(err)}`));
          });
        });

        const elapsedMs = Date.now() - startMs;
        console.log(`[whisper] done in ${elapsedMs}ms, text length=${text.length}`);
        if (cliStderr) console.log("[whisper] stderr:", cliStderr.trim());
        if (cliStdout) console.log("[whisper] stdout:", cliStdout.trim());

        return { ok: true, text, stderr: cliStderr.trim(), elapsed: elapsedMs };
      } catch (err) {
        return { ok: false, error: String(err) };
      } finally {
        try {
          fs.rmSync(wavPath, { force: true });
        } catch {
          /* ignore */
        }
        try {
          fs.rmSync(outputTxtPath, { force: true });
        } catch {
          /* ignore */
        }
      }
    }
  );

  ipcMain.handle("whisper-set-gateway-model", async (_event, modelId: string) => {
    try {
      writeSelectedWhisperModel(params.stateDir, modelId);
      await params.stopGatewayChild();
      await params.startGateway({ silent: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
