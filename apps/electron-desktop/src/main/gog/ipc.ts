import { ipcMain } from "electron";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { IPC } from "../../shared/ipc-channels";
import { checkBinaryExists } from "../ipc/exec";
import type { GogHandlerParams } from "../ipc/types";
import { ensureDir } from "../util/fs";
import { getPlatform } from "../platform";
import { runGog, runGogAuthAdd } from "./gog";
import type { GogExecResult } from "./types";

const PREPARE_CMD = "cd apps/electron-desktop && npm run fetch:gog";

export function registerGogIpcHandlers(params: GogHandlerParams) {
  const { gogBin, openclawDir, userData, stateDir } = params;

  ipcMain.handle(IPC.gogAuthList, async () => {
    const notFound = checkBinaryExists(gogBin, PREPARE_CMD);
    if (notFound) return notFound;
    return await runGog({ bin: gogBin, args: ["auth", "list"], cwd: openclawDir, stateDir });
  });

  ipcMain.handle(
    IPC.gogAuthAdd,
    async (_evt, p: { account?: unknown; services?: unknown; noInput?: unknown }) => {
      const notFound = checkBinaryExists(gogBin, PREPARE_CMD);
      if (notFound) return notFound;
      const account = typeof p?.account === "string" ? p.account.trim() : "";
      const services = typeof p?.services === "string" ? p.services.trim() : "gmail";
      const noInput = Boolean(p?.noInput);
      if (!account) {
        return {
          ok: false,
          code: null,
          stdout: "",
          stderr: "account is required",
        } satisfies GogExecResult;
      }

      return await runGogAuthAdd({
        gogBin,
        openclawDir,
        stateDir,
        account,
        services,
        noInput,
      });
    }
  );

  ipcMain.handle(
    IPC.gogAuthCredentials,
    async (_evt, p: { credentialsJson?: unknown; filename?: unknown }) => {
      const notFound = checkBinaryExists(gogBin, PREPARE_CMD);
      if (notFound) return notFound;
      const text = typeof p?.credentialsJson === "string" ? p.credentialsJson : "";
      if (!text.trim()) {
        return {
          ok: false,
          code: null,
          stdout: "",
          stderr: "credentialsJson is required",
        } satisfies GogExecResult;
      }
      const tmpDir = path.join(userData, "tmp");
      ensureDir(tmpDir);
      const nameRaw = typeof p?.filename === "string" ? p.filename.trim() : "";
      const base = nameRaw && nameRaw.endsWith(".json") ? nameRaw : "gog-client-secret.json";
      const tmpPath = path.join(tmpDir, `${randomBytes(8).toString("hex")}-${base}`);
      fs.writeFileSync(tmpPath, text, { encoding: "utf-8" });
      try {
        getPlatform().restrictFilePermissions(tmpPath);
      } catch {
        // ignore
      }
      try {
        const res = await runGog({
          bin: gogBin,
          args: ["auth", "credentials", "set", tmpPath, "--no-input"],
          cwd: openclawDir,
          stateDir,
        });
        return res;
      } finally {
        try {
          fs.rmSync(tmpPath, { force: true });
        } catch {
          // ignore
        }
      }
    }
  );
}
