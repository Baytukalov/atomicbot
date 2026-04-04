import { spawn } from "node:child_process";
import * as fs from "node:fs";

import type { GogExecResult } from "./types";
import { getGogKeyringEnv } from "./gog-keyring";
import { getPlatform } from "../platform";

export function runGog(params: {
  bin: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  timeoutMs?: number;
}): Promise<GogExecResult> {
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 120_000;
  const keyringEnv = params.stateDir ? getGogKeyringEnv(params.stateDir) : {};
  const mergedEnv = { ...process.env, ...keyringEnv, ...params.env };
  return new Promise<GogExecResult>((resolve) => {
    const child = spawn(params.bin, params.args, {
      cwd: params.cwd,
      env: mergedEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onData = (buf: Buffer, which: "stdout" | "stderr") => {
      const text = buf.toString("utf-8");
      if (which === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };
    child.stdout?.on("data", (b: Buffer) => onData(b, "stdout"));
    child.stderr?.on("data", (b: Buffer) => onData(b, "stderr"));

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try {
        getPlatform().forceKillChild(child);
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0,
        code: typeof code === "number" ? code : null,
        stdout,
        stderr,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${String(err)}`,
      });
    });
  });
}

export function parseGogAuthListEmails(jsonText: string): string[] {
  try {
    const parsed = JSON.parse(jsonText || "{}") as { accounts?: unknown };
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const emails = accounts
      .map((a) => (a && typeof a === "object" ? (a as { email?: unknown }).email : undefined))
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return Array.from(new Set(emails));
  } catch {
    return [];
  }
}

export async function clearGogAuthTokens(params: {
  gogBin: string;
  openclawDir: string;
  stateDir?: string;
  warnings: string[];
}) {
  if (!fs.existsSync(params.gogBin)) {
    params.warnings.push(`gog binary not found at: ${params.gogBin}`);
    return;
  }
  const list = await runGog({
    bin: params.gogBin,
    args: ["auth", "list", "--json", "--no-input"],
    cwd: params.openclawDir,
    stateDir: params.stateDir,
    timeoutMs: 15_000,
  });
  if (!list.ok) {
    const msg = (list.stderr || list.stdout || "").trim();
    params.warnings.push(`gog auth list failed: ${msg || "unknown error"}`);
    return;
  }
  const emails = parseGogAuthListEmails(list.stdout);
  for (const email of emails) {
    const res = await runGog({
      bin: params.gogBin,
      args: ["auth", "remove", email, "--force", "--no-input"],
      cwd: params.openclawDir,
      stateDir: params.stateDir,
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      const msg = (res.stderr || res.stdout || "").trim();
      params.warnings.push(`gog auth remove failed for ${email}: ${msg || "unknown error"}`);
    }
  }
}

async function clearGogAccountsBeforeAdd(params: {
  gogBin: string;
  openclawDir: string;
  stateDir?: string;
}): Promise<GogExecResult | null> {
  const list = await runGog({
    bin: params.gogBin,
    args: ["auth", "list", "--json", "--no-input"],
    cwd: params.openclawDir,
    stateDir: params.stateDir,
    timeoutMs: 15_000,
  });
  if (!list.ok) {
    const msg = (list.stderr || list.stdout || "").trim();
    return {
      ...list,
      stderr: `gog auth list failed: ${msg || "unknown error"}`,
    };
  }

  const emails = parseGogAuthListEmails(list.stdout);
  for (const email of emails) {
    const res = await runGog({
      bin: params.gogBin,
      args: ["auth", "remove", email, "--force", "--no-input"],
      cwd: params.openclawDir,
      stateDir: params.stateDir,
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      const msg = (res.stderr || res.stdout || "").trim();
      return {
        ...res,
        stderr: `gog auth remove failed for ${email}: ${msg || "unknown error"}`,
      };
    }
  }

  return null;
}

export async function runGogAuthAdd(params: {
  gogBin: string;
  openclawDir: string;
  stateDir: string;
  account: string;
  services: string;
  noInput?: boolean;
}): Promise<GogExecResult> {
  const cleanupError = await clearGogAccountsBeforeAdd(params);
  if (cleanupError) {
    return cleanupError;
  }

  const args = ["auth", "add", params.account, "--services", params.services];
  if (params.noInput) {
    args.push("--no-input");
  }

  return runGog({
    bin: params.gogBin,
    args,
    cwd: params.openclawDir,
    stateDir: params.stateDir,
  });
}
