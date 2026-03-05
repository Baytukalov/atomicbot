import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { authActions, clearAuth, persistMode } from "@store/slices/auth/authSlice";
import { reloadConfig } from "@store/slices/configSlice";
import { errorToMessage } from "@shared/toast";
import { ConfirmDialog } from "@shared/kit";
import { routes } from "../app/routes";
import { settingsStyles as ps } from "./SettingsPage";
import { openExternal } from "@shared/utils/openExternal";
import { useTerminalSidebarVisible } from "@shared/hooks/useTerminalSidebarVisible";
import { RestoreBackupModal } from "./RestoreBackupModal";
import s from "./OtherTab.module.css";
import pkg from "../../../../package.json";

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [terminalSidebar, setTerminalSidebar] = useTerminalSidebarVisible();
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const authMode = useAppSelector((st) => st.auth.mode);

  const appVersion = pkg.version || "0.0.0";

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
        setLaunchAtStartup(!enabled);
        onError(errorToMessage(err));
      }
    },
    [onError]
  );

  const confirmResetAndClose = React.useCallback(async () => {
    setResetConfirmOpen(false);
    const api = getDesktopApiOrNull();
    if (!api) {
      onError("Desktop API not available");
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
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
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
            onClick={() => openExternal("https://github.com/AtomicBot-ai/atomicbot")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://atomicbot.ai")}
          >
            Website
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://x.com/atomicbot_ai")}
          >
            X
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://www.instagram.com/atomicbot.ai/")}
          >
            Instagram
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => openExternal("https://discord.gg/2TXafRV69m")}
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
              onClick={() => setResetConfirmOpen(true)}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={resetConfirmOpen}
        title="Reset and sign out?"
        subtitle="All local data will be deleted and Google Workspace will be disconnected. The app will close and you'll need to set it up again."
        confirmLabel="Reset"
        danger
        onConfirm={() => void confirmResetAndClose()}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
