import React from "react";
import { useNavigate } from "react-router-dom";

import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { authActions, clearAuth, persistMode } from "@store/slices/auth/authSlice";
import { errorToMessage } from "@shared/toast";
import { routes } from "../../app/routes";
import { RestoreBackupModal } from "../RestoreBackupModal";
import s from "../OtherTab.module.css";

export function BackupSection({ onError }: { onError: (msg: string | null) => void }) {
  const [backupBusy, setBackupBusy] = React.useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = React.useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const authMode = useAppSelector((st) => st.auth.mode);

  const handleCreateBackup = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.createBackup) {
      onError(DESKTOP_API_UNAVAILABLE);
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
    [navigate, dispatch],
  );

  return (
    <>
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
    </>
  );
}
