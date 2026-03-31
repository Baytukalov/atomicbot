import { app } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAppState } from "../app-state";
import { DEFAULT_PORT } from "../constants";

const mocks = vi.hoisted(() => ({
  readConsentAccepted: vi.fn(() => true),
  writeConsentAccepted: vi.fn(),
  runConfigMigrations: vi.fn(),
  runExecApprovalsMigrations: vi.fn(),
  ensureGatewayConfigFile: vi.fn(),
  readGatewayTokenFromConfig: vi.fn(() => "token-from-config"),
  createGatewayStarter: vi.fn(),
  killOrphanedGateway: vi.fn(() => null),
  removeStaleGatewayLock: vi.fn(),
  registerIpcHandlers: vi.fn(),
  resolveBin: vi.fn((name: string) => `/bin/${name}`),
  resolveBundledNodeBin: vi.fn(() => "/bin/node"),
  resolveBundledOpenClawDir: vi.fn(() => "/mock/openclaw"),
  resolvePreloadPath: vi.fn(() => "/mock/preload.js"),
  resolveRendererIndex: vi.fn(() => "/mock/index.html"),
  resolveRepoRoot: vi.fn(() => "/mock/repo"),
  registerTerminalIpcHandlers: vi.fn(),
  createTailBuffer: vi.fn(() => ({ push: vi.fn(), read: vi.fn(() => "") })),
  pickPort: vi.fn(async () => 18789),
  killUpdateSplash: vi.fn(),
  initAutoUpdater: vi.fn(),
  readAnalyticsState: vi.fn(() => ({
    prompted: true,
    enabled: false,
    userId: "test-user-id",
    enabledAt: null,
  })),
  writeAnalyticsState: vi.fn(),
  initPosthogMain: vi.fn(),
  captureMain: vi.fn(),
  readActiveModelId: vi.fn(() => null),
  readOnboardedState: vi.fn(() => false),
  readSetupMode: vi.fn(() => null),
  isBackendDownloaded: vi.fn(() => false),
  resolveServerBinPath: vi.fn(() => "/mock/llamacpp/llama-server"),
  getLlamacppModelDef: vi.fn((id: string) => ({ id, fileSizeGb: 5.3 })),
  resolveLlamacppModelPath: vi.fn(() => "/mock/llamacpp/models/model.gguf"),
  resolveChatTemplatePath: vi.fn(() => "/mock/template.jinja"),
  startLlamacppServer: vi.fn(async () => ({ port: 18790 })),
  getSystemInfo: vi.fn(() => ({ totalRamGb: 48 })),
  computeContextLength: vi.fn(() => 200000),
  fsExistsSync: vi.fn(() => false),
  fsReadFileSync: vi.fn(() => {
    throw new Error("ENOENT");
  }),
}));

vi.mock("../consent", () => ({
  readConsentAccepted: mocks.readConsentAccepted,
  writeConsentAccepted: mocks.writeConsentAccepted,
}));
vi.mock("../gateway/config-migrations", () => ({
  runConfigMigrations: mocks.runConfigMigrations,
}));
vi.mock("../gateway/exec-approvals-migrations", () => ({
  runExecApprovalsMigrations: mocks.runExecApprovalsMigrations,
}));
vi.mock("../gateway/config", () => ({
  ensureGatewayConfigFile: mocks.ensureGatewayConfigFile,
  readGatewayTokenFromConfig: mocks.readGatewayTokenFromConfig,
}));
vi.mock("../gateway/lifecycle", () => ({
  createGatewayStarter: mocks.createGatewayStarter,
}));
vi.mock("../gateway/pid-file", () => ({
  killOrphanedGateway: mocks.killOrphanedGateway,
  removeStaleGatewayLock: mocks.removeStaleGatewayLock,
}));
vi.mock("../ipc/register", () => ({ registerIpcHandlers: mocks.registerIpcHandlers }));
vi.mock("../openclaw/paths", () => ({
  resolveBin: mocks.resolveBin,
  resolveBundledNodeBin: mocks.resolveBundledNodeBin,
  resolveBundledOpenClawDir: mocks.resolveBundledOpenClawDir,
  resolvePreloadPath: mocks.resolvePreloadPath,
  resolveRendererIndex: mocks.resolveRendererIndex,
  resolveRepoRoot: mocks.resolveRepoRoot,
}));
vi.mock("../terminal/ipc", () => ({
  registerTerminalIpcHandlers: mocks.registerTerminalIpcHandlers,
}));
vi.mock("../util/net", () => ({
  createTailBuffer: mocks.createTailBuffer,
  pickPort: mocks.pickPort,
}));
vi.mock("../update-splash", () => ({ killUpdateSplash: mocks.killUpdateSplash }));
vi.mock("../updater", () => ({ initAutoUpdater: mocks.initAutoUpdater }));
vi.mock("../analytics/analytics-state", () => ({
  readAnalyticsState: mocks.readAnalyticsState,
  writeAnalyticsState: mocks.writeAnalyticsState,
}));
vi.mock("../analytics/posthog-main", () => ({
  initPosthogMain: mocks.initPosthogMain,
  captureMain: mocks.captureMain,
}));
vi.mock("../llamacpp/model-state", () => ({
  readActiveModelId: mocks.readActiveModelId,
}));
vi.mock("../setup-mode-state", () => ({
  readSetupMode: mocks.readSetupMode,
}));
vi.mock("../onboarding-state", () => ({
  readOnboardedState: mocks.readOnboardedState,
}));
vi.mock("../llamacpp/backend-download", () => ({
  resolveServerBinPath: mocks.resolveServerBinPath,
  isBackendDownloaded: mocks.isBackendDownloaded,
}));
vi.mock("../llamacpp/models", () => ({
  getLlamacppModelDef: mocks.getLlamacppModelDef,
  resolveLlamacppModelPath: mocks.resolveLlamacppModelPath,
  resolveChatTemplatePath: mocks.resolveChatTemplatePath,
}));
vi.mock("../llamacpp/server", () => ({
  startLlamacppServer: mocks.startLlamacppServer,
}));
vi.mock("../llamacpp/hardware", () => ({
  getSystemInfo: mocks.getSystemInfo,
  computeContextLength: mocks.computeContextLength,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => mocks.fsExistsSync(...args),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      mocks.fsReadFileSync(...args),
  };
});

import { bootstrapApp } from "./app-bootstrap";

describe("bootstrapApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app.isPackaged = false;
    vi.mocked(app.getPath).mockImplementation((name: string) => `/mock/${name}`);
    mocks.readOnboardedState.mockReturnValue(false);
    mocks.readSetupMode.mockReturnValue(null);
    mocks.fsExistsSync.mockReturnValue(false);
    mocks.fsReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
  });

  it("returns early when lock is missing", async () => {
    const state = createAppState();
    await bootstrapApp({
      gotTheLock: false,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });
    expect(mocks.pickPort).not.toHaveBeenCalled();
    expect(mocks.registerIpcHandlers).not.toHaveBeenCalled();
  });

  it("wires app bootstrap and starts gateway", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    const ensureWindow = vi.fn(async () => null);
    const ensureTray = vi.fn();

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow,
      ensureTray,
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(mocks.pickPort).toHaveBeenCalledWith(DEFAULT_PORT);
    expect(state.gatewayStateDir).toBe("/mock/userData/openclaw");
    expect(state.logsDirForUi).toBe("/mock/userData/logs");
    expect(ensureWindow).toHaveBeenCalled();
    expect(ensureTray).toHaveBeenCalled();
    expect(mocks.registerIpcHandlers).toHaveBeenCalled();
    expect(mocks.registerTerminalIpcHandlers).toHaveBeenCalled();
    expect(startGateway).toHaveBeenCalled();
  });

  it("does not auto-start llamacpp when config primary is not llamacpp", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    mocks.readActiveModelId.mockReturnValue("qwen-3.5-9b");
    mocks.isBackendDownloaded.mockReturnValue(true);
    mocks.fsExistsSync.mockReturnValue(true);
    mocks.fsReadFileSync.mockImplementation((pathLike) => {
      if (String(pathLike).endsWith("/openclaw/openclaw.json")) {
        return JSON.stringify({
          agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
        });
      }
      return "";
    });

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(startGateway).toHaveBeenCalled();
    expect(mocks.startLlamacppServer).not.toHaveBeenCalled();
  });

  it("does not auto-start llamacpp without the local-model marker", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    mocks.readActiveModelId.mockReturnValue("qwen-3.5-9b");
    mocks.isBackendDownloaded.mockReturnValue(true);
    mocks.fsExistsSync.mockReturnValue(true);
    mocks.fsReadFileSync.mockImplementation((pathLike) => {
      if (String(pathLike).endsWith("/openclaw/openclaw.json")) {
        return JSON.stringify({
          agents: { defaults: { model: { primary: "llamacpp/qwen-3.5-9b" } } },
        });
      }
      return "";
    });

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(startGateway).toHaveBeenCalled();
    expect(mocks.startLlamacppServer).not.toHaveBeenCalled();
  });

  it("does not auto-start llamacpp before onboarding completes", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    mocks.readSetupMode.mockReturnValue("local-model");
    mocks.readActiveModelId.mockReturnValue("qwen-3.5-9b");
    mocks.isBackendDownloaded.mockReturnValue(true);
    mocks.fsExistsSync.mockReturnValue(true);
    mocks.fsReadFileSync.mockImplementation((pathLike) => {
      if (String(pathLike).endsWith("/openclaw/openclaw.json")) {
        return JSON.stringify({
          agents: { defaults: { model: { primary: "llamacpp/qwen-3.5-9b" } } },
        });
      }
      return "";
    });

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(startGateway).toHaveBeenCalled();
    expect(mocks.startLlamacppServer).not.toHaveBeenCalled();
  });

  it("auto-starts llamacpp when the local-model marker is present", async () => {
    const state = createAppState();
    const startGateway = vi.fn(async () => {});
    mocks.createGatewayStarter.mockReturnValue(startGateway);
    mocks.readOnboardedState.mockReturnValue(true);
    mocks.readSetupMode.mockReturnValue("local-model");
    mocks.readActiveModelId.mockReturnValue("qwen-3.5-9b");
    mocks.isBackendDownloaded.mockReturnValue(true);
    mocks.fsExistsSync.mockReturnValue(true);
    mocks.fsReadFileSync.mockImplementation((pathLike) => {
      if (String(pathLike).endsWith("/openclaw/openclaw.json")) {
        return JSON.stringify({
          agents: { defaults: { model: { primary: "llamacpp/qwen-3.5-9b" } } },
        });
      }
      return "";
    });

    await bootstrapApp({
      gotTheLock: true,
      state,
      mainDir: "/mock/main",
      platform: { killAllByName: vi.fn() } as never,
      ensureWindow: vi.fn(async () => null),
      ensureTray: vi.fn(),
      stopGatewayChild: vi.fn(async () => {}),
    });

    expect(startGateway).toHaveBeenCalled();
    expect(mocks.startLlamacppServer).toHaveBeenCalledTimes(1);
  });
});
