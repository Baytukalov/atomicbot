import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  switchToSubscription,
  switchToSelfManaged,
  authActions,
  clearAuth,
  persistMode,
} from "@store/slices/auth/authSlice";
import { reloadConfig } from "@store/slices/configSlice";
import { errorToMessage, addToastError } from "@shared/toast";
import { routes } from "../app/routes";
import { settingsStyles as ps } from "./SettingsPage";
import { Modal } from "@shared/kit";
import { RestoreBackupModal } from "./RestoreBackupModal";
import s from "./OtherTab.module.css";
import pkg from "../../../../package.json";

const TERMINAL_SIDEBAR_KEY = "terminal-sidebar-visible";

export function useTerminalSidebarVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = React.useState(() => {
    try {
      return localStorage.getItem(TERMINAL_SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = React.useCallback((v: boolean) => {
    setVisible(v);
    try {
      localStorage.setItem(TERMINAL_SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
    // Notify other components (Sidebar) that are already mounted.
    window.dispatchEvent(new Event("terminal-sidebar-changed"));
  }, []);

  return [visible, toggle];
}

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [terminalSidebar, setTerminalSidebar] = useTerminalSidebarVisible();
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const [modeSwitchBusy, setModeSwitchBusy] = React.useState(false);
  const [confirmModeSwitch, setConfirmModeSwitch] = React.useState<"on" | "off" | null>(null);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const authMode = useAppSelector((st) => st.auth.mode);
  const isSubscription = authMode === "paid";

  const appVersion = pkg.version || "0.0.0";

  // Load the current launch-at-login state on mount.
  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getLaunchAtLogin) {
      return;
    }
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
  }, []);

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.setLaunchAtLogin) {
        onError("Desktop API not available");
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        // Revert on failure.
        setLaunchAtStartup(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError]
  );

  const requestToggleSubscription = React.useCallback((enabled: boolean) => {
    setConfirmModeSwitch(enabled ? "on" : "off");
  }, []);

  const handleConfirmModeSwitch = React.useCallback(async () => {
    const direction = confirmModeSwitch;
    setConfirmModeSwitch(null);
    if (!direction) return;

    setModeSwitchBusy(true);
    try {
      if (direction === "on") {
        await dispatch(switchToSubscription({ request: gw.request })).unwrap();
        await dispatch(reloadConfig({ request: gw.request }));
        navigate(`${routes.settings}/account`);
      } else {
        const result = await dispatch(switchToSelfManaged({ request: gw.request })).unwrap();
        await dispatch(reloadConfig({ request: gw.request }));
        navigate(`${routes.settings}/ai-providers`);
        if (!result.hasBackup) {
          onError("No saved configuration found. Please set up your API keys.");
        }
      }
    } catch (err) {
      addToastError(err);
    } finally {
      setModeSwitchBusy(false);
    }
  }, [confirmModeSwitch, dispatch, gw.request, navigate, onError]);

  const resetAndClose = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "All local data will be deleted and Google Workspace will be disconnected. The app will close and you’ll need to set it up again."
    );
    void getDesktopApiOrNull()?.focusWindow();
    if (!ok) {
      return;
    }
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(errorToMessage(err));
      setResetBusy(false);
    }
  }, [onError]);

  const handleCreateBackup = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.createBackup) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setBackupBusy(true);
    try {
      const result = await api.createBackup(authMode ?? undefined);
      if (!result.ok && !result.cancelled) {
        onError(result.error || "Failed to create backup");
      }
    } catch (err) {
      onError(errorToMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }, [onError, authMode]);

  const handleRestored = React.useCallback(
    (meta?: { mode?: string }) => {
      dispatch(authActions.clearAuthState());
      void dispatch(clearAuth());

      const restoredMode =
        meta?.mode === "paid" || meta?.mode === "self-managed" ? meta.mode : "self-managed";
      dispatch(authActions.setMode(restoredMode));
      persistMode(restoredMode);

      setRestoreModalOpen(false);
      if (restoredMode === "paid") {
        navigate(`${routes.settings}/account`);
      } else {
        navigate(routes.chat);
      }
    },
    [navigate, dispatch]
  );

  const api = getDesktopApiOrNull();

  return (
    <div className={ps.UiSettingsContentInner}>
      {/* App & About (combined) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>App</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Version</span>
            <span className={s.UiSettingsOtherAppRowValue}>Atomic Bot v{appVersion}</span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Auto start</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <div className={s.UiSettingsOtherRowLabelGroup}>
              <span className={s.UiSettingsOtherRowLabel}>Switch to Subscription</span>
              <span className={s.UiSettingsOtherRowSubLabel}>A mode for simpler use.</span>
            </div>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Switch to subscription mode">
                <input
                  type="checkbox"
                  checked={isSubscription}
                  disabled={modeSwitchBusy}
                  onChange={(e) => requestToggleSubscription(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                void api?.openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Support</span>
            <a href="mailto:support@atomicbot.ai" className={s.UiSettingsOtherLink}>
              support@atomicbot.ai
            </a>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.legacy} className={s.UiSettingsOtherLink}>
              Legacy UI Dashboard
            </NavLink>
          </div>
        </div>
        <div className={s.UiSettingsOtherLinksRow}>
          <span className={s.UiSettingsOtherFooterCopy}>
            &copy; {new Date().getFullYear()} Atomic Bot
          </span>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://github.com/AtomicBot-ai/atomicbot")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://atomicbot.ai")}
          >
            Website
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://x.com/atomicbot_ai")}
          >
            X
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://www.instagram.com/atomicbot.ai/")}
          >
            Instagram
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://discord.gg/2TXafRV69m")}
          >
            Discord
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Backup</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Create backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              disabled={backupBusy}
              onClick={() => void handleCreateBackup()}
            >
              {backupBusy ? "Creating..." : "Save to file"}
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Restore from backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => setRestoreModalOpen(true)}
            >
              Choose file
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Create a full backup of your OpenClaw configuration or restore from a previously saved
          backup.
        </p>
      </section>

      <Modal
        open={confirmModeSwitch !== null}
        onClose={() => setConfirmModeSwitch(null)}
        header={
          confirmModeSwitch === "on" ? "Turn on subscription mode?" : "Turn off subscription mode?"
        }
        aria-label="Confirm subscription mode switch"
      >
        <p className={s.UiConfirmDescription}>
          {confirmModeSwitch === "on"
            ? "You won't need to manage API keys anymore. Your current configuration will be saved, and you can switch back to it at any time. Are you sure you want to continue?"
            : "You're about to turn off subscription mode and go back to your own API keys. Are you sure you want to do this?"}
        </p>
        <div className={s.UiConfirmActions}>
          <button
            type="button"
            className={s.UiConfirmCancel}
            onClick={() => setConfirmModeSwitch(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.UiConfirmAccept}
            onClick={() => void handleConfirmModeSwitch()}
          >
            {confirmModeSwitch === "on" ? "Turn on" : "Turn off"}
          </button>
        </div>
      </Modal>

      <RestoreBackupModal
        open={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestored={handleRestored}
      />

      {/* Folders: OpenClaw data + Agent workspace */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Folders</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>OpenClaw folder</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openOpenclawFolder()}
            >
              Open folder
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Agent workspace</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Contains your local OpenClaw state and app data. Workspace contains editable .md files
          (AGENTS, SOUL, USER, IDENTITY, TOOLS, HEARTBEAT, BOOTSTRAP) that shape the agent.
        </p>
      </section>

      {/* Terminal */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Terminal</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Show in sidebar</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Show terminal in sidebar">
                <input
                  type="checkbox"
                  checked={terminalSidebar}
                  onChange={(e) => setTerminalSidebar(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.terminal} className={s.UiSettingsOtherLink}>
              Open Terminal
            </NavLink>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Built-in terminal with openclaw and bundled tools in PATH.
        </p>
      </section>

      {/* Danger zone (reset) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Account</h3>
        <p className={s.UiSettingsOtherDangerSubtitle}>
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will restart.
        </p>
        <div className={`${s.UiSettingsOtherCard} ${s["UiSettingsOtherCard--danger"]}`}>
          <div className={s.UiSettingsOtherRow}>
            <button
              type="button"
              className={s.UiSettingsOtherDangerButton}
              disabled={resetBusy}
              onClick={() => void resetAndClose()}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
