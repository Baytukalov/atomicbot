/**
 * IPC contract test: verifies that registerIpcHandlers registers all expected channels.
 * This is the most critical safety net for the register.ts split refactoring.
 * If any channel is lost during extraction, this test breaks immediately.
 *
 * Channel names are sourced from the shared IPC_CHANNELS constant so that
 * handler registrations and the preload bridge stay in sync automatically.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";

import { registerIpcHandlers } from "./register";
import { IPC } from "../../shared/ipc-channels";

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
