import * as fs from "node:fs";
import * as path from "node:path";

export type DesktopSetupMode = "paid" | "self-managed" | "local-model";

const STATE_FILE = "desktop-setup-mode.json";

function isDesktopSetupMode(value: unknown): value is DesktopSetupMode {
  return value === "paid" || value === "self-managed" || value === "local-model";
}

export function readSetupMode(stateDir: string): DesktopSetupMode | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir, STATE_FILE), "utf-8");
    const parsed = JSON.parse(raw) as { mode?: unknown };
    return isDesktopSetupMode(parsed.mode) ? parsed.mode : null;
  } catch {
    return null;
  }
}

export function writeSetupMode(stateDir: string, mode: DesktopSetupMode): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, STATE_FILE),
    JSON.stringify({ mode, updatedAt: new Date().toISOString() })
  );
}

export function clearSetupMode(stateDir: string): void {
  try {
    fs.unlinkSync(path.join(stateDir, STATE_FILE));
  } catch {
    // Best effort: file may already be absent.
  }
}
