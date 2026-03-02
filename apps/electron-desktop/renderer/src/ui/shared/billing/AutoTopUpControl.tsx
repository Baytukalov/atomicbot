import React from "react";

import { Modal, PrimaryButton, InlineError } from "@shared/kit";
import type { UpdateAutoTopUpPayload } from "@ipc/backendApi";
import type { AutoTopUpState } from "@store/slices/auth/authSlice";

import s from "./AutoTopUpControl.module.css";

type AutoTopUpControlProps = {
  settings: AutoTopUpState;
  loading?: boolean;
  saving?: boolean;
  error?: string | null;
  title?: string;
  className?: string;
  onPatch: (payload: UpdateAutoTopUpPayload) => Promise<unknown>;
  onError?: (error: unknown) => void;
};

type FormErrors = {
  thresholdUsd?: string;
  topupAmountUsd?: string;
  monthlyCapUsd?: string;
};

function formatDollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed)) return Number.NaN;
  return parsed;
}

function validateForm(input: {
  thresholdUsd: string;
  topupAmountUsd: string;
  monthlyCapUsd: string;
}): FormErrors {
  const errors: FormErrors = {};

  const threshold = Number.parseFloat(input.thresholdUsd);
  const topupAmount = Number.parseFloat(input.topupAmountUsd);
  const monthlyCap = parseOptionalNumber(input.monthlyCapUsd);

  if (Number.isNaN(threshold) || threshold < 1) {
    errors.thresholdUsd = "Minimum threshold: $1";
  }
  if (Number.isNaN(topupAmount) || topupAmount < 5) {
    errors.topupAmountUsd = "Minimum top-up amount: $5";
  }
  if (monthlyCap !== null && (Number.isNaN(monthlyCap) || monthlyCap < 5)) {
    errors.monthlyCapUsd = "Minimum monthly cap: $5";
  }

  return errors;
}

export function AutoTopUpControl({
  settings,
  loading = false,
  saving = false,
  error = null,
  title = "Auto top up settings",
  className,
  onPatch,
  onError,
}: AutoTopUpControlProps) {
  const [open, setOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const infoRef = React.useRef<HTMLButtonElement>(null);
  const [thresholdUsd, setThresholdUsd] = React.useState(String(settings.thresholdUsd));
  const [topupAmountUsd, setTopupAmountUsd] = React.useState(String(settings.topupAmountUsd));
  const [monthlyCapUsd, setMonthlyCapUsd] = React.useState(
    settings.monthlyCapUsd === null ? "" : String(settings.monthlyCapUsd)
  );
  const [formErrors, setFormErrors] = React.useState<FormErrors>({});

  const syncFormFromSettings = React.useCallback(() => {
    setThresholdUsd(String(settings.thresholdUsd));
    setTopupAmountUsd(String(settings.topupAmountUsd));
    setMonthlyCapUsd(settings.monthlyCapUsd === null ? "" : String(settings.monthlyCapUsd));
    setFormErrors({});
  }, [settings.monthlyCapUsd, settings.thresholdUsd, settings.topupAmountUsd]);

  const handleToggle = React.useCallback(
    async (enabled: boolean) => {
      try {
        await onPatch({
          enabled,
          thresholdUsd: settings.thresholdUsd,
          topupAmountUsd: settings.topupAmountUsd,
          monthlyCapUsd: settings.monthlyCapUsd,
        });
      } catch (patchError) {
        onError?.(patchError);
      }
    },
    [onPatch, onError, settings.monthlyCapUsd, settings.thresholdUsd, settings.topupAmountUsd]
  );

  const handleSave = React.useCallback(async () => {
    const nextErrors = validateForm({ thresholdUsd, topupAmountUsd, monthlyCapUsd });
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const monthlyCap = parseOptionalNumber(monthlyCapUsd);
    try {
      await onPatch({
        enabled: settings.enabled,
        thresholdUsd: Number.parseFloat(thresholdUsd),
        topupAmountUsd: Number.parseFloat(topupAmountUsd),
        monthlyCapUsd: monthlyCap,
      });
      setOpen(false);
    } catch (patchError) {
      onError?.(patchError);
    }
  }, [monthlyCapUsd, onPatch, onError, settings.enabled, thresholdUsd, topupAmountUsd]);

  React.useEffect(() => {
    if (!infoOpen) return;
    const handler = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [infoOpen]);

  const wrapperClassName = className ? `${s.root} ${className}` : s.root;
  const monthlyLimitText =
    settings.monthlyCapUsd === null
      ? "No monthly cap"
      : `${formatDollars(settings.currentMonthSpentUsd)} / ${formatDollars(settings.monthlyCapUsd)} this month`;

  return (
    <>
      <div className={wrapperClassName}>
        <div className={s.header}>
          <div className={s.titleWrap}>
            <span className={s.title}>{title}</span>
            <button
              ref={infoRef}
              type="button"
              className={s.infoBtn}
              onClick={() => setInfoOpen((v) => !v)}
              aria-label="What is auto refill?"
            >
              &#9432;
              {infoOpen ? (
                <div className={s.infoPopover}>
                  Automatically recharge card when credit balance falls below a threshold
                </div>
              ) : null}
            </button>
          </div>

          <div className={s.actions}>
            <button
              type="button"
              className={s.configureButton}
              onClick={() => {
                syncFormFromSettings();
                setOpen(true);
              }}
              disabled={loading || saving}
              aria-label="Open auto top up settings"
            >
              ...
            </button>
            <label className={s.toggle}>
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={loading || saving}
                onChange={(e) => {
                  void handleToggle(e.target.checked);
                }}
              />
              <span className={s.toggleTrack} />
            </label>
          </div>
        </div>

        <span className={s.hint}>
          Add {formatDollars(settings.topupAmountUsd)} when balance &lt;{" "}
          {formatDollars(settings.thresholdUsd)}
        </span>
        <span className={s.subHintSrOnly}>{monthlyLimitText}</span>
        {!settings.hasPaymentMethod ? (
          <span className={s.subHintSrOnly}>No payment method detected in billing portal yet.</span>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
      </div>

      <Modal
        open={open}
        onClose={() => {
          if (saving) return;
          setOpen(false);
        }}
        header="Auto top up settings"
        aria-label="Auto top up settings"
      >
        <div className={s.modalBody}>
          <label className={s.fieldLabel} htmlFor="autoTopUpThreshold">
            When credits are below
          </label>
          <div className={s.inputWrap}>
            <span className={s.currency}>$</span>
            <input
              id="autoTopUpThreshold"
              className={s.input}
              type="number"
              min={1}
              step={0.01}
              value={thresholdUsd}
              onChange={(e) => setThresholdUsd(e.target.value)}
              disabled={saving}
            />
          </div>
          {formErrors.thresholdUsd ? <InlineError>{formErrors.thresholdUsd}</InlineError> : null}

          <label className={s.fieldLabel} htmlFor="autoTopUpAmount">
            Purchase this amount
          </label>
          <div className={s.inputWrap}>
            <span className={s.currency}>$</span>
            <input
              id="autoTopUpAmount"
              className={s.input}
              type="number"
              min={5}
              step={0.01}
              value={topupAmountUsd}
              onChange={(e) => setTopupAmountUsd(e.target.value)}
              disabled={saving}
            />
          </div>
          {formErrors.topupAmountUsd ? (
            <InlineError>{formErrors.topupAmountUsd}</InlineError>
          ) : null}

          <label className={s.fieldLabel} htmlFor="autoTopUpMonthlyCap">
            Monthly limit
          </label>
          <div className={s.inputWrap}>
            <span className={s.currency}>$</span>
            <input
              id="autoTopUpMonthlyCap"
              className={s.input}
              type="number"
              min={5}
              step={0.01}
              value={monthlyCapUsd}
              onChange={(e) => setMonthlyCapUsd(e.target.value)}
              placeholder="Unlimited"
              disabled={saving}
            />
          </div>
          {formErrors.monthlyCapUsd ? <InlineError>{formErrors.monthlyCapUsd}</InlineError> : null}

          <div className={s.modalActions}>
            <PrimaryButton
              size="sm"
              loading={saving}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              Save
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </>
  );
}
