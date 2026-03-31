import * as fs from "node:fs";
import * as path from "node:path";

const STATE_FILE = "llamacpp-active-model.json";

export function readActiveModelId(stateDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, STATE_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { modelId?: string };
    return typeof parsed.modelId === "string" ? parsed.modelId : null;
  } catch {
    return null;
  }
}

export function writeActiveModelId(stateDir: string, modelId: string): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, STATE_FILE),
    JSON.stringify({ modelId, updatedAt: new Date().toISOString() })
  );
}

export function clearActiveModelId(stateDir: string): void {
  try {
    fs.unlinkSync(path.join(stateDir, STATE_FILE));
  } catch {
    // Best effort: file may already be absent.
  }
}
