import * as fs from "node:fs";
import * as path from "node:path";

import JSON5 from "json5";

import { ensureDir } from "../util/fs";

export function readGatewayTokenFromConfig(configPath: string): string | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const text = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON5.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const cfg = parsed as {
      gateway?: { auth?: { token?: unknown } };
    };
    const token = cfg.gateway?.auth?.token;
    return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Create the initial config file if it doesn't exist yet.
 * Existing configs are patched by `runConfigMigrations()` (config-migrations.ts).
 */
export function ensureGatewayConfigFile(params: { configPath: string; token: string }) {
  ensureDir(path.dirname(params.configPath));

  if (fs.existsSync(params.configPath)) {
    return;
  }

  const minimal = {
    gateway: {
      mode: "local",
      bind: "loopback",
      auth: {
        mode: "token",
        token: params.token,
      },
      controlUi: {
        allowedOrigins: ["null"],
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
    },
    browser: {
      defaultProfile: "openclaw",
    },
    logging: {
      level: "debug",
      consoleLevel: "debug",
    },
  };

  fs.writeFileSync(params.configPath, `${JSON.stringify(minimal, null, 2)}\n`, "utf-8");
}
