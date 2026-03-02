/**
 * IPC handlers for Windows Defender exclusion management.
 *
 * On Windows, Defender's real-time scanning can significantly slow down
 * the gateway (file I/O, process spawning). These handlers let the
 * renderer prompt the user to add exclusions via an elevated PowerShell
 * command (triggers a single UAC dialog).
 */
import { app, ipcMain } from "electron";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { DefenderHandlerParams } from "./types";

type DefenderStatus = {
  /** Whether exclusions have already been applied (or were dismissed permanently). */
  applied: boolean;
  /** Whether the user permanently dismissed the prompt. */
  dismissed: boolean;
  /** Whether we're on Windows (banner should only show on win32). */
  isWindows: boolean;
};

type DefenderApplyResult = {
  ok: boolean;
  error?: string;
};

const DEFENDER_STATE_FILE = "defender-exclusions.json";

function readDefenderState(stateDir: string): { applied: boolean; dismissed: boolean } {
  try {
    const filePath = path.join(stateDir, DEFENDER_STATE_FILE);
    if (!fs.existsSync(filePath)) {
      return { applied: false, dismissed: false };
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      applied: parsed.applied === true,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { applied: false, dismissed: false };
  }
}

function writeDefenderState(
  stateDir: string,
  state: { applied: boolean; dismissed: boolean }
): void {
  try {
    const filePath = path.join(stateDir, DEFENDER_STATE_FILE);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  } catch (err) {
    console.warn("[defender-ipc] writeDefenderState failed:", err);
  }
}

/**
 * Build the PowerShell script that adds Defender exclusions.
 * Runs elevated (triggers UAC prompt via Start-Process -Verb RunAs).
 */
function buildExclusionScript(stateDir: string): string {
  const userData = app.getPath("userData");
  const exePath = app.getPath("exe");
  const paths = [userData, stateDir].map((p) => p.replace(/'/g, "''"));
  const processes = ["node.exe", path.basename(exePath)];

  const addCmds = [
    ...paths.map((p) => `Add-MpPreference -ExclusionPath '${p}' -ErrorAction Stop`),
    ...processes.map((p) => `Add-MpPreference -ExclusionProcess '${p}' -ErrorAction Stop`),
  ];

  // Wrap in a single elevated PowerShell invocation.
  // -Wait ensures we block until the elevated process finishes so we can
  // detect success/failure.
  const inner = addCmds.join("; ");
  return inner;
}

export function registerDefenderHandlers(params: DefenderHandlerParams) {
  if (process.platform !== "win32") {
    // Register no-op handlers so the renderer doesn't get "No handler" errors
    // when calling from non-Windows platforms during development.
    ipcMain.handle("defender-status", async () => ({
      applied: false,
      dismissed: false,
      isWindows: false,
    }));
    ipcMain.handle(
      "defender-apply-exclusions",
      async (): Promise<DefenderApplyResult> => ({ ok: true })
    );
    ipcMain.handle("defender-dismiss", async () => ({ ok: true }));
    return;
  }

  ipcMain.handle("defender-status", async (): Promise<DefenderStatus> => {
    const state = readDefenderState(params.stateDir);
    return { ...state, isWindows: true };
  });

  ipcMain.handle("defender-apply-exclusions", async (): Promise<DefenderApplyResult> => {
    const script = buildExclusionScript(params.stateDir);

    return new Promise<DefenderApplyResult>((resolve) => {
      // Run elevated PowerShell: Start-Process with -Verb RunAs triggers UAC.
      // We write the command to a temp .ps1 file so we can capture exit code.
      const tmpScript = path.join(app.getPath("temp"), `defender-exclusion-${Date.now()}.ps1`);
      const ps1Content = `try { ${script}; exit 0 } catch { exit 1 }`;
      fs.writeFileSync(tmpScript, ps1Content, "utf-8");

      // Use PowerShell to launch an elevated process and wait for it.
      const cmd = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `$p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${tmpScript.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode`,
      ];

      execFile(
        "powershell.exe",
        cmd,
        { windowsHide: true, timeout: 60_000 },
        (err, _stdout, stderr) => {
          // Clean up temp file.
          try {
            fs.unlinkSync(tmpScript);
          } catch {
            // best-effort
          }

          if (err) {
            const msg = stderr?.trim() || (err as NodeJS.ErrnoException).message || "Unknown error";
            // Exit code 1 from the inner script, or user cancelled UAC.
            console.warn("[defender-ipc] apply exclusions failed:", msg);
            resolve({ ok: false, error: msg });
            return;
          }

          writeDefenderState(params.stateDir, { applied: true, dismissed: false });
          resolve({ ok: true });
        }
      );
    });
  });

  ipcMain.handle("defender-dismiss", async () => {
    const state = readDefenderState(params.stateDir);
    writeDefenderState(params.stateDir, { ...state, dismissed: true });
    return { ok: true };
  });
}
