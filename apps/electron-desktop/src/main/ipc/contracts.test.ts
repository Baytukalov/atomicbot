/**
 * IPC contract test: verifies that registerIpcHandlers registers all expected channels.
 * This is the most critical safety net for the register.ts split refactoring.
 * If any channel is lost during extraction, this test breaks immediately.
 *
 * Channel names are sourced from the shared IPC_CHANNELS constant so that
 * handler registrations and the preload bridge stay in sync automatically.
 *
 * Also includes type-level assertions that each handler module accepts
 * only the narrowed Pick of RegisterParams it actually needs.
 */
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { ipcMain } from "electron";

import { registerIpcHandlers } from "./register";
import { IPC } from "../../shared/ipc-channels";
import type {
  BackupHandlerParams,
  ConfigHandlerParams,
  DefenderHandlerParams,
  FileHandlerParams,
  GhHandlerParams,
  KeyHandlerParams,
  MemoHandlerParams,
  ObsidianHandlerParams,
  OAuthHandlerParams,
  RemindctlHandlerParams,
  SkillHandlerParams,
} from "./types";
import type { registerFileHandlers } from "./files";
import type { registerKeyHandlers } from "./keys-ipc";
import type { registerMemoHandlers } from "./memo-ipc";
import type { registerRemindctlHandlers } from "./remindctl-ipc";
import type { registerObsidianHandlers } from "./obsidian-ipc";
import type { registerGhHandlers } from "./gh-ipc";
import type { registerConfigHandlers } from "./config-ipc";
import type { registerOAuthHandlers } from "./oauth-ipc";
import type { registerSkillHandlers } from "./skills-ipc";
import type { registerBackupHandlers } from "./backup-ipc";
import type { registerDefenderHandlers } from "./defender-ipc";

// Terminal channels are registered by registerTerminalIpcHandlers (separate call in main.ts).
const TERMINAL_CHANNELS = new Set([
  IPC.terminalCreate,
  IPC.terminalWrite,
  IPC.terminalResize,
  IPC.terminalKill,
  IPC.terminalList,
  IPC.terminalGetBuffer,
]);

/** All IPC channels that must be registered by registerIpcHandlers + sub-registrations. */
const EXPECTED_CHANNELS: string[] = Object.values(IPC).filter((ch) => !TERMINAL_CHANNELS.has(ch));

describe("IPC channel contracts", () => {
  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockReset();
  });

  it("registers all expected channels", () => {
    const mockParams = {
      getMainWindow: () => null,
      getGatewayState: () => null,
      getLogsDir: () => "/tmp/logs",
      getConsentAccepted: () => true,
      acceptConsent: vi.fn(async () => {}),
      startGateway: vi.fn(async () => {}),
      userData: "/tmp/user",
      stateDir: "/tmp/state",
      logsDir: "/tmp/logs",
      openclawDir: "/tmp/openclaw",
      gogBin: "/bin/gog",
      memoBin: "/bin/memo",
      remindctlBin: "/bin/remindctl",
      obsidianCliBin: "/bin/obsidian-cli",
      ghBin: "/bin/gh",
      whisperCliBin: "/bin/whisper-cli",
      stopGatewayChild: vi.fn(async () => {}),
      getGatewayToken: vi.fn(() => "test-token"),
      setGatewayToken: vi.fn(),
    };

    registerIpcHandlers(mockParams);

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map((call) => call[0]);

    for (const channel of EXPECTED_CHANNELS) {
      expect(registeredChannels, `Missing IPC channel: ${channel}`).toContain(channel);
    }
  });

  it("does not register unexpected channels", () => {
    const mockParams = {
      getMainWindow: () => null,
      getGatewayState: () => null,
      getLogsDir: () => "/tmp/logs",
      getConsentAccepted: () => true,
      acceptConsent: vi.fn(async () => {}),
      startGateway: vi.fn(async () => {}),
      userData: "/tmp/user",
      stateDir: "/tmp/state",
      logsDir: "/tmp/logs",
      openclawDir: "/tmp/openclaw",
      gogBin: "/bin/gog",
      memoBin: "/bin/memo",
      remindctlBin: "/bin/remindctl",
      obsidianCliBin: "/bin/obsidian-cli",
      ghBin: "/bin/gh",
      whisperCliBin: "/bin/whisper-cli",
      stopGatewayChild: vi.fn(async () => {}),
      getGatewayToken: vi.fn(() => "test-token"),
      setGatewayToken: vi.fn(),
    };

    registerIpcHandlers(mockParams);

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map((call) => call[0]);

    for (const channel of registeredChannels) {
      expect(EXPECTED_CHANNELS, `Unexpected IPC channel registered: ${channel}`).toContain(channel);
    }
  });
});

/**
 * Type-level assertions: each handler module must accept only its
 * narrowed Pick of RegisterParams. If a handler starts using a new
 * field, TS will flag a mismatch here, forcing the Pick to be updated.
 */
describe("IPC handler param narrowing", () => {
  it("each handler accepts only its required fields (compile-time check)", () => {
    expectTypeOf<Parameters<typeof registerFileHandlers>[0]>().toEqualTypeOf<FileHandlerParams>();
    expectTypeOf<Parameters<typeof registerKeyHandlers>[0]>().toEqualTypeOf<KeyHandlerParams>();
    expectTypeOf<Parameters<typeof registerMemoHandlers>[0]>().toEqualTypeOf<MemoHandlerParams>();
    expectTypeOf<
      Parameters<typeof registerRemindctlHandlers>[0]
    >().toEqualTypeOf<RemindctlHandlerParams>();
    expectTypeOf<
      Parameters<typeof registerObsidianHandlers>[0]
    >().toEqualTypeOf<ObsidianHandlerParams>();
    expectTypeOf<Parameters<typeof registerGhHandlers>[0]>().toEqualTypeOf<GhHandlerParams>();
    expectTypeOf<
      Parameters<typeof registerConfigHandlers>[0]
    >().toEqualTypeOf<ConfigHandlerParams>();
    expectTypeOf<Parameters<typeof registerOAuthHandlers>[0]>().toEqualTypeOf<OAuthHandlerParams>();
    expectTypeOf<Parameters<typeof registerSkillHandlers>[0]>().toEqualTypeOf<SkillHandlerParams>();
    expectTypeOf<
      Parameters<typeof registerBackupHandlers>[0]
    >().toEqualTypeOf<BackupHandlerParams>();
    expectTypeOf<
      Parameters<typeof registerDefenderHandlers>[0]
    >().toEqualTypeOf<DefenderHandlerParams>();
  });
});
