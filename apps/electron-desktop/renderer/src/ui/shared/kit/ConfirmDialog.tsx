import React from "react";

/**
 * Reusable confirmation dialog rendered over a modal overlay.
 * Follows the same pattern as session-delete confirm in SessionSidebarItem.
 */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    if (!props.open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props.open, props.onCancel]);

  if (!props.open) {
    return null;
  }

  const confirmClass = props.danger
    ? "UiConfirmDialog__confirm UiConfirmDialog__confirm--danger"
    : "UiConfirmDialog__confirm";

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <div className="UiConfirmDialog">
        <p className="UiConfirmDialog__text">{props.title}</p>
        {props.subtitle && <p className="UiConfirmDialog__sub">{props.subtitle}</p>}
        <div className="UiConfirmDialog__actions">
          <button type="button" className="UiConfirmDialog__cancel" onClick={props.onCancel}>
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button type="button" className={confirmClass} onClick={props.onConfirm} autoFocus>
            {props.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
