/**
 * Monkey-patch child_process spawn functions to always set
 * `windowsHide: true` on Windows, preventing console window flashes
 * when the gateway (or any openclaw process) spawns child processes.
 *
 * Call once at process startup, before any spawn calls.
 */
export function patchSpawnForWindows(): void {
  if (process.platform !== "win32") {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("node:child_process");

  const originalSpawn = cp.spawn;
  cp.spawn = function patchedSpawn(command: string, ...rest: unknown[]): unknown {
    const args = normalizeSpawnArgs(rest);
    if (args.options) {
      args.options.windowsHide = true;
    }
    return args.hasArgs
      ? originalSpawn.call(this, command, args.argv, args.options)
      : originalSpawn.call(this, command, args.options);
  };

  const originalSpawnSync = cp.spawnSync;
  cp.spawnSync = function patchedSpawnSync(command: string, ...rest: unknown[]): unknown {
    const args = normalizeSpawnArgs(rest);
    if (args.options) {
      args.options.windowsHide = true;
    }
    return args.hasArgs
      ? originalSpawnSync.call(this, command, args.argv, args.options)
      : originalSpawnSync.call(this, command, args.options);
  };

  const originalExecFile = cp.execFile;
  cp.execFile = function patchedExecFile(file: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecFile.call(this, file, ...rest);
  };

  const originalExecFileSync = cp.execFileSync;
  cp.execFileSync = function patchedExecFileSync(file: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecFileSync.call(this, file, ...rest);
  };

  const originalExecSync = cp.execSync;
  cp.execSync = function patchedExecSync(command: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecSync.call(this, command, ...rest);
  };
}

function normalizeSpawnArgs(rest: unknown[]): {
  hasArgs: boolean;
  argv: unknown;
  options: Record<string, unknown>;
} {
  if (rest.length === 0) {
    const opts: Record<string, unknown> = {};
    return { hasArgs: false, argv: undefined, options: opts };
  }

  if (Array.isArray(rest[0])) {
    const argv = rest[0];
    const opts = rest[1] && typeof rest[1] === "object" ? (rest[1] as Record<string, unknown>) : {};
    if (!rest[1]) {
      rest[1] = opts;
    }
    return { hasArgs: true, argv, options: opts };
  }

  if (rest[0] && typeof rest[0] === "object") {
    return {
      hasArgs: false,
      argv: undefined,
      options: rest[0] as Record<string, unknown>,
    };
  }

  const opts: Record<string, unknown> = {};
  return { hasArgs: false, argv: undefined, options: opts };
}
