import React from "react";
import type { ClawHubLlmDimension } from "./useClawHubSkills";
import s from "./ClawHubDetailPage.module.css";

export const VERDICT_COLORS: Record<string, { bg: string; text: string }> = {
  benign: { bg: "rgba(34, 197, 94, 0.12)", text: "rgba(34, 197, 94, 0.9)" },
  clean: { bg: "rgba(34, 197, 94, 0.12)", text: "rgba(34, 197, 94, 0.9)" },
  suspicious: { bg: "rgba(245, 158, 11, 0.12)", text: "rgba(245, 158, 11, 0.9)" },
  malicious: { bg: "rgba(239, 68, 68, 0.15)", text: "rgba(239, 68, 68, 0.9)" },
};

export const DIMENSION_RATING_ICON: Record<string, string> = {
  ok: "✓",
  note: "ℹ",
  warn: "⚠",
  concern: "⚠",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const colors = VERDICT_COLORS[verdict] ?? VERDICT_COLORS.suspicious;
  return (
    <span className={s.UiVerdictBadge} style={{ background: colors.bg, color: colors.text }}>
      {verdict}
    </span>
  );
}

export function DimensionRow({ dim }: { dim: ClawHubLlmDimension }) {
  const icon = DIMENSION_RATING_ICON[dim.rating] ?? "•";
  const ratingClass =
    dim.rating === "ok" ? s.UiDimOk : dim.rating === "note" ? s.UiDimNote : s.UiDimWarn;

  return (
    <details className={s.UiDimRow}>
      <summary className={s.UiDimSummary}>
        <span className={`${s.UiDimIcon} ${ratingClass}`}>{icon}</span>
        <span className={s.UiDimLabel}>{dim.label}</span>
        <span className={`${s.UiDimRating} ${ratingClass}`}>{dim.rating}</span>
      </summary>
      <p className={s.UiDimDetail}>{dim.detail}</p>
    </details>
  );
}
