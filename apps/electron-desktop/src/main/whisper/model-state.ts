import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_MODEL_ID, type WhisperModelId } from "./ipc";

const WHISPER_MODEL_FILE = "whisper-model-id";

export function readSelectedWhisperModel(stateDir: string): WhisperModelId | "openai" {
  try {
    const raw = fs.readFileSync(path.join(stateDir, WHISPER_MODEL_FILE), "utf-8").trim();
    if (
      raw === "openai" ||
      raw === "small" ||
      raw === "large-v3-turbo-q8" ||
      raw === "large-v3-turbo"
    ) {
      return raw;
    }
  } catch {
    // File doesn't exist yet — use default
  }
  return DEFAULT_MODEL_ID;
}

export function writeSelectedWhisperModel(stateDir: string, modelId: string): void {
  fs.writeFileSync(path.join(stateDir, WHISPER_MODEL_FILE), modelId, "utf-8");
}
