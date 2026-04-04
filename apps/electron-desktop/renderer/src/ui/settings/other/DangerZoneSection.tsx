import React from "react";

import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { errorToMessage } from "@shared/toast";
import { ConfirmDialog } from "@shared/kit";
import s from "../OtherTab.module.css";

export function DangerZoneSection({ onError }: { onError: (msg: string | null) => void }) {
  const [resetBusy, setResetBusy] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);

  const confirmResetAndClose = React.useCallback(async () => {
    setResetConfirmOpen(false);
    const api = getDesktopApiOrNull();
    if (!api) {
      onError(DESKTOP_API_UNAVAILABLE);
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

  return (
    <>
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
    </>
  );
}
