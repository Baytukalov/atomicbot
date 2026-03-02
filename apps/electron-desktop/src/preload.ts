import { contextBridge, ipcRenderer } from "electron";

import type { ExecResult } from "./shared/types";
import type { GogExecResult } from "./main/gog/types";
import type { GatewayState, ResetAndCloseResult } from "./main/types";
import { IPC, IPC_EVENTS } from "./shared/ipc-channels";

type UpdateAvailablePayload = {
  version: string;
  releaseDate?: string;
};

type UpdateDownloadProgressPayload = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

type UpdateDownloadedPayload = {
  version: string;
};

type UpdateErrorPayload = {
  message: string;
};

/** Helper: subscribe to an IPC event channel with automatic unsubscribe. */
function onIpc<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_evt: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

type OpenclawDesktopApi = {
  platform: NodeJS.Platform;
  version: string;
  openLogs: () => Promise<void>;
  openWorkspaceFolder: () => Promise<void>;
  openOpenclawFolder: () => Promise<void>;
  toggleDevTools: () => Promise<void>;
  retry: () => Promise<void>;
  resetAndClose: () => Promise<ResetAndCloseResult>;
  getGatewayInfo: () => Promise<{ state: GatewayState | null }>;
  getConsentInfo: () => Promise<{ accepted: boolean }>;
  acceptConsent: () => Promise<{ ok: true }>;
  startGateway: () => Promise<{ ok: true }>;
  openExternal: (url: string) => Promise<void>;
  setApiKey: (provider: string, apiKey: string) => Promise<{ ok: true }>;
  setSetupToken: (provider: string, token: string) => Promise<{ ok: true }>;
  validateApiKey: (provider: string, apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  authHasApiKey: (provider: string) => Promise<{ configured: boolean }>;
  authReadProfiles: () => Promise<{
    profiles: Record<string, { type: string; provider: string; [k: string]: unknown }>;
    order: Record<string, string[]>;
  }>;
  authWriteProfiles: (store: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  }) => Promise<{ ok: true }>;
  // OAuth login (runs full flow in main process, opens browser automatically)
  oauthLogin: (provider: string) => Promise<{ ok: true; profileId: string }>;
  onOAuthProgress: (cb: (payload: { provider: string; message: string }) => void) => () => void;
  gogAuthList: () => Promise<GogExecResult>;
  gogAuthAdd: (params: {
    account: string;
    services?: string;
    noInput?: boolean;
  }) => Promise<GogExecResult>;
  gogAuthCredentials: (params: {
    credentialsJson: string;
    filename?: string;
  }) => Promise<GogExecResult>;
  memoCheck: () => Promise<ExecResult>;
  remindctlAuthorize: () => Promise<ExecResult>;
  remindctlTodayJson: () => Promise<ExecResult>;
  obsidianCliCheck: () => Promise<ExecResult>;
  obsidianCliPrintDefaultPath: () => Promise<ExecResult>;
  obsidianVaultsList: () => Promise<ExecResult>;
  obsidianCliSetDefault: (params: { vaultName: string }) => Promise<ExecResult>;
  ghCheck: () => Promise<ExecResult>;
  ghAuthLoginPat: (params: { pat: string }) => Promise<ExecResult>;
  ghAuthStatus: () => Promise<ExecResult>;
  ghApiUser: () => Promise<ExecResult>;
  onGatewayState: (cb: (state: GatewayState) => void) => () => void;
  // OpenClaw config (openclaw.json)
  readConfig: () => Promise<{ ok: boolean; content: string; error?: string }>;
  writeConfig: (content: string) => Promise<{ ok: boolean; error?: string }>;
  // Launch at login (auto-start)
  getLaunchAtLogin: () => Promise<{ enabled: boolean }>;
  setLaunchAtLogin: (enabled: boolean) => Promise<{ ok: true }>;
  // App version
  getAppVersion: () => Promise<{ version: string }>;
  fetchReleaseNotes: (
    version: string,
    owner: string,
    repo: string
  ) => Promise<{ ok: boolean; body: string; htmlUrl: string }>;
  // Auto-updater
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) => () => void;
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) => () => void;
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) => () => void;
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => () => void;
  // Backup & restore
  createBackup: (mode?: string) => Promise<{ ok: boolean; cancelled?: boolean; error?: string }>;
  restoreBackup: (
    data: string,
    filename?: string
  ) => Promise<{ ok: boolean; error?: string; meta?: { mode?: string } }>;
  detectLocalOpenclaw: () => Promise<{ found: boolean; path: string }>;
  restoreFromDirectory: (
    dirPath: string
  ) => Promise<{ ok: boolean; error?: string; meta?: { mode?: string } }>;
  selectOpenclawFolder: () => Promise<{
    ok: boolean;
    path?: string;
    cancelled?: boolean;
    error?: string;
  }>;
  // Custom skills
  installCustomSkill: (data: string) => Promise<{
    ok: boolean;
    skill?: { name: string; description: string; emoji: string; dirName: string };
    error?: string;
  }>;
  listCustomSkills: () => Promise<{
    ok: boolean;
    skills: Array<{ name: string; description: string; emoji: string; dirName: string }>;
  }>;
  removeCustomSkill: (dirName: string) => Promise<{ ok: boolean; error?: string }>;
  // Local Whisper voice transcription
  whisperModelStatus: (params?: { model?: string }) => Promise<{
    modelReady: boolean;
    binReady: boolean;
    modelPath: string;
    size: number;
    modelId: string;
  }>;
  whisperModelDownload: (params?: {
    model?: string;
  }) => Promise<{ ok: boolean; modelPath?: string; error?: string }>;
  whisperModelDownloadCancel: () => Promise<{ ok: boolean }>;
  whisperSetGatewayModel: (modelId: string) => Promise<{ ok: boolean; error?: string }>;
  onWhisperModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => () => void;
  whisperModelsList: () => Promise<
    Array<{
      id: string;
      label: string;
      description: string;
      sizeLabel: string;
      downloaded: boolean;
      size: number;
    }>
  >;
  whisperTranscribe: (params: {
    audio: string;
    language?: string;
    model?: string;
  }) => Promise<{ ok: boolean; text?: string; error?: string }>;
  // Refocus BrowserWindow after native dialogs steal OS-level focus
  focusWindow: () => Promise<void>;
  // Windows Defender exclusions
  defenderStatus: () => Promise<{ applied: boolean; dismissed: boolean; isWindows: boolean }>;
  defenderApplyExclusions: () => Promise<{ ok: boolean; error?: string }>;
  defenderDismiss: () => Promise<{ ok: boolean }>;
  onDeepLink: (
    cb: (payload: { host: string; pathname: string; params: Record<string, string> }) => void
  ) => () => void;
  // Embedded terminal (PTY) — multi-session
  terminalCreate: () => Promise<{ id: string }>;
  terminalWrite: (id: string, data: string) => Promise<void>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<void>;
  terminalKill: (id: string) => Promise<void>;
  terminalList: () => Promise<Array<{ id: string; alive: boolean }>>;
  terminalGetBuffer: (id: string) => Promise<string>;
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (
    cb: (payload: { id: string; exitCode: number; signal?: number }) => void
  ) => () => void;
};

// Expose only the bare minimum to the renderer. The Control UI is served by the Gateway and
// does not require Electron privileged APIs.
const api: OpenclawDesktopApi = {
  platform: process.platform,
  version: "0.0.0",
  openLogs: async () => ipcRenderer.invoke(IPC.openLogs),
  openWorkspaceFolder: async () => ipcRenderer.invoke(IPC.openWorkspaceFolder),
  openOpenclawFolder: async () => ipcRenderer.invoke(IPC.openOpenclawFolder),
  toggleDevTools: async () => ipcRenderer.invoke(IPC.devtoolsToggle),
  retry: async () => ipcRenderer.invoke(IPC.gatewayRetry),
  resetAndClose: async () => ipcRenderer.invoke(IPC.resetAndClose),
  getGatewayInfo: async () => ipcRenderer.invoke(IPC.gatewayGetInfo),
  getConsentInfo: async () => ipcRenderer.invoke(IPC.consentGet),
  acceptConsent: async () => ipcRenderer.invoke(IPC.consentAccept),
  startGateway: async () => ipcRenderer.invoke(IPC.gatewayStart),
  openExternal: async (url: string) => ipcRenderer.invoke(IPC.openExternal, { url }),
  setApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke(IPC.authSetApiKey, { provider, apiKey }),
  setSetupToken: async (provider: string, token: string) =>
    ipcRenderer.invoke(IPC.authSetSetupToken, { provider, token }),
  validateApiKey: async (provider: string, apiKey: string) =>
    ipcRenderer.invoke(IPC.authValidateApiKey, { provider, apiKey }),
  authHasApiKey: async (provider: string) => ipcRenderer.invoke(IPC.authHasApiKey, { provider }),
  authReadProfiles: async () => ipcRenderer.invoke(IPC.authReadProfiles),
  authWriteProfiles: async (store: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  }) => ipcRenderer.invoke(IPC.authWriteProfiles, store),
  oauthLogin: async (provider: string) => ipcRenderer.invoke(IPC.oauthLogin, { provider }),
  onOAuthProgress: (cb: (payload: { provider: string; message: string }) => void) =>
    onIpc(IPC_EVENTS.oauthProgress, cb),
  gogAuthList: async () => ipcRenderer.invoke(IPC.gogAuthList),
  gogAuthAdd: async (params: { account: string; services?: string; noInput?: boolean }) =>
    ipcRenderer.invoke(IPC.gogAuthAdd, params),
  gogAuthCredentials: async (params: { credentialsJson: string; filename?: string }) =>
    ipcRenderer.invoke(IPC.gogAuthCredentials, params),
  memoCheck: async () => ipcRenderer.invoke(IPC.memoCheck),
  remindctlAuthorize: async () => ipcRenderer.invoke(IPC.remindctlAuthorize),
  remindctlTodayJson: async () => ipcRenderer.invoke(IPC.remindctlTodayJson),
  obsidianCliCheck: async () => ipcRenderer.invoke(IPC.obsidianCliCheck),
  obsidianCliPrintDefaultPath: async () => ipcRenderer.invoke(IPC.obsidianCliPrintDefaultPath),
  obsidianVaultsList: async () => ipcRenderer.invoke(IPC.obsidianVaultsList),
  obsidianCliSetDefault: async (params: { vaultName: string }) =>
    ipcRenderer.invoke(IPC.obsidianCliSetDefault, params),
  ghCheck: async () => ipcRenderer.invoke(IPC.ghCheck),
  ghAuthLoginPat: async (params: { pat: string }) => ipcRenderer.invoke(IPC.ghAuthLoginPat, params),
  ghAuthStatus: async () => ipcRenderer.invoke(IPC.ghAuthStatus),
  ghApiUser: async () => ipcRenderer.invoke(IPC.ghApiUser),
  onGatewayState: (cb: (state: GatewayState) => void) => onIpc(IPC_EVENTS.gatewayState, cb),
  readConfig: async () => ipcRenderer.invoke(IPC.configRead),
  writeConfig: async (content: string) => ipcRenderer.invoke(IPC.configWrite, { content }),
  getLaunchAtLogin: async () => ipcRenderer.invoke(IPC.launchAtLoginGet),
  setLaunchAtLogin: async (enabled: boolean) =>
    ipcRenderer.invoke(IPC.launchAtLoginSet, { enabled }),
  getAppVersion: async () => ipcRenderer.invoke(IPC.getAppVersion),
  fetchReleaseNotes: async (version: string, owner: string, repo: string) =>
    ipcRenderer.invoke(IPC.fetchReleaseNotes, { version, owner, repo }),
  checkForUpdate: async () => ipcRenderer.invoke(IPC.updaterCheck),
  downloadUpdate: async () => ipcRenderer.invoke(IPC.updaterDownload),
  installUpdate: async () => ipcRenderer.invoke(IPC.updaterInstall),
  onUpdateAvailable: (cb: (payload: UpdateAvailablePayload) => void) =>
    onIpc(IPC_EVENTS.updaterAvailable, cb),
  onUpdateDownloadProgress: (cb: (payload: UpdateDownloadProgressPayload) => void) =>
    onIpc(IPC_EVENTS.updaterDownloadProgress, cb),
  onUpdateDownloaded: (cb: (payload: UpdateDownloadedPayload) => void) =>
    onIpc(IPC_EVENTS.updaterDownloaded, cb),
  onUpdateError: (cb: (payload: UpdateErrorPayload) => void) => onIpc(IPC_EVENTS.updaterError, cb),
  createBackup: async (mode?: string) => ipcRenderer.invoke(IPC.backupCreate, { mode }),
  restoreBackup: async (data: string, filename?: string) =>
    ipcRenderer.invoke(IPC.backupRestore, { data, filename }),
  detectLocalOpenclaw: async () => ipcRenderer.invoke(IPC.backupDetectLocal),
  restoreFromDirectory: async (dirPath: string) =>
    ipcRenderer.invoke(IPC.backupRestoreFromDir, { dirPath }),
  selectOpenclawFolder: async () => ipcRenderer.invoke(IPC.backupSelectFolder),
  installCustomSkill: async (data: string) => ipcRenderer.invoke(IPC.installCustomSkill, { data }),
  listCustomSkills: async () => ipcRenderer.invoke(IPC.listCustomSkills),
  removeCustomSkill: async (dirName: string) =>
    ipcRenderer.invoke(IPC.removeCustomSkill, { dirName }),
  whisperModelStatus: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.whisperModelStatus, params),
  whisperModelDownload: async (params?: { model?: string }) =>
    ipcRenderer.invoke(IPC.whisperModelDownload, params),
  whisperModelDownloadCancel: async () => ipcRenderer.invoke(IPC.whisperModelDownloadCancel),
  whisperSetGatewayModel: async (modelId: string) =>
    ipcRenderer.invoke(IPC.whisperSetGatewayModel, modelId),
  onWhisperModelDownloadProgress: (
    cb: (payload: { percent: number; transferred: number; total: number }) => void
  ) => onIpc(IPC_EVENTS.whisperModelDownloadProgress, cb),
  whisperModelsList: async () => ipcRenderer.invoke(IPC.whisperModelsList),
  whisperTranscribe: async (params: { audio: string; language?: string; model?: string }) =>
    ipcRenderer.invoke(IPC.whisperTranscribe, params),
  focusWindow: async () => ipcRenderer.invoke(IPC.focusWindow),
  defenderStatus: async () => ipcRenderer.invoke(IPC.defenderStatus),
  defenderApplyExclusions: async () => ipcRenderer.invoke(IPC.defenderApplyExclusions),
  defenderDismiss: async () => ipcRenderer.invoke(IPC.defenderDismiss),
  onDeepLink: (
    cb: (payload: { host: string; pathname: string; params: Record<string, string> }) => void
  ) => onIpc(IPC_EVENTS.deepLink, cb),
  terminalCreate: async () => ipcRenderer.invoke(IPC.terminalCreate),
  terminalWrite: async (id: string, data: string) =>
    ipcRenderer.invoke(IPC.terminalWrite, { id, data }),
  terminalResize: async (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.terminalResize, { id, cols, rows }),
  terminalKill: async (id: string) => ipcRenderer.invoke(IPC.terminalKill, { id }),
  terminalList: async () => ipcRenderer.invoke(IPC.terminalList),
  terminalGetBuffer: async (id: string) => ipcRenderer.invoke(IPC.terminalGetBuffer, { id }),
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) =>
    onIpc(IPC_EVENTS.terminalData, cb),
  onTerminalExit: (cb: (payload: { id: string; exitCode: number; signal?: number }) => void) =>
    onIpc(IPC_EVENTS.terminalExit, cb),
};

contextBridge.exposeInMainWorld("openclawDesktop", api);
