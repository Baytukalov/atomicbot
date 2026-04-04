import React from "react";

import { useGatewayRpc } from "@gateway/context";
import { errorToMessage } from "@shared/toast";
import type { SecurityLevel, ExecApprovalsSnapshot } from "./types";
import { deriveSecurityLevel, applySecurityLevel } from "./types";
import s from "../OtherTab.module.css";

export function SecuritySection({ onError }: { onError: (msg: string | null) => void }) {
  const [securityLevel, setSecurityLevel] = React.useState<SecurityLevel>("balanced");
  const [securityBusy, setSecurityBusy] = React.useState(false);
  const approvalsRef = React.useRef<ExecApprovalsSnapshot | null>(null);
  const gw = useGatewayRpc();

  React.useEffect(() => {
    if (!gw.connected) return;
    void gw
      .request<ExecApprovalsSnapshot>("exec.approvals.get", {})
      .then((snap) => {
        approvalsRef.current = snap;
        setSecurityLevel(deriveSecurityLevel(snap.file));
      })
      .catch((err) => console.warn("[exec.approvals] load snapshot failed:", err));
  }, [gw, gw.connected]);

  const handleSecurityLevelChange = React.useCallback(
    async (level: SecurityLevel) => {
      const prev = securityLevel;
      setSecurityLevel(level);
      setSecurityBusy(true);
      onError(null);
      try {
        const snap = await gw.request<ExecApprovalsSnapshot>("exec.approvals.get", {});
        approvalsRef.current = snap;
        const nextFile = applySecurityLevel(snap.file, level);
        await gw.request("exec.approvals.set", {
          baseHash: snap.hash,
          file: nextFile,
        });
        approvalsRef.current = { ...snap, file: nextFile };

        // Keep main config tools.exec.security/ask in sync so minSecurity
        // does not silently downgrade the user's chosen level.
        const configSnap = await gw.request<{ hash?: string }>("config.get", {});
        const configHash =
          typeof configSnap.hash === "string" && configSnap.hash.trim()
            ? configSnap.hash.trim()
            : null;
        if (configHash) {
          const execPatch =
            level === "permissive"
              ? { security: "full", ask: "off" }
              : { security: "allowlist", ask: "on-miss" };
          await gw.request("config.patch", {
            baseHash: configHash,
            raw: JSON.stringify({ tools: { exec: execPatch } }, null, 2),
            note: `Settings: sync exec security to ${level}`,
          });
        }
      } catch (err) {
        setSecurityLevel(prev);
        onError(errorToMessage(err));
      } finally {
        setSecurityBusy(false);
      }
    },
    [gw, onError, securityLevel],
  );

  return (
    <section className={s.UiSettingsOtherSection}>
      <h3 className={s.UiSettingsOtherSectionTitle}>Agent</h3>
      <div className={s.UiSettingsOtherCard}>
        <div className={s.UiSettingsOtherRow}>
          <div className={s.UiSettingsOtherRowLabelGroup}>
            <span className={s.UiSettingsOtherRowLabel}>Command approval</span>
            <span className={s.UiSettingsOtherRowSubLabel}>
              Controls when shell commands require your approval
            </span>
          </div>
          <select
            className={s.UiSettingsOtherSelect}
            value={securityLevel}
            disabled={securityBusy}
            onChange={(e) => void handleSecurityLevelChange(e.target.value as SecurityLevel)}
          >
            <option value="balanced">Balanced</option>
            <option value="permissive">Permissive</option>
          </select>
        </div>
      </div>
      <p className={s.UiSettingsOtherHint}>
        <strong>Balanced</strong> — approve only unknown commands. <strong>Permissive</strong> —
        no approvals needed.
      </p>
    </section>
  );
}
