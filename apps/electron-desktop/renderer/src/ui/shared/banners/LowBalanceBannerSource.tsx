import React from "react";
import { useAppSelector, useAppDispatch } from "@store/hooks";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { createAddonCheckout } from "@store/slices/auth/authSlice";
import { useBannerRegister } from "./BannerContext";
import type { BannerItem } from "./types";

const BANNER_ID = "low-balance";
const LOW_BALANCE_THRESHOLD = 0.05;
const DEFAULT_TOPUP_USD = 10;

function EmptyWalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 7v4m0 2.5h.008M4.34 17h11.32c1.34 0 2.18-1.45 1.51-2.606L11.51 3.606a1.745 1.745 0 00-3.02 0L2.83 14.394C2.16 15.55 3 17 4.34 17z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LowBalanceBannerSource() {
  const subscription = useAppSelector((s) => s.auth.subscription);
  const balance = useAppSelector((s) => s.auth.balance);
  const dispatch = useAppDispatch();

  const handleTopUp = React.useCallback(async () => {
    try {
      const result = await dispatch(createAddonCheckout({ amountUsd: DEFAULT_TOPUP_USD })).unwrap();
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      }
    } catch {
      // Checkout failed — silently ignore; user can retry
    }
  }, [dispatch]);

  // Only show when subscription is active but balance is depleted
  const shouldShow =
    subscription !== null &&
    subscription.status !== "canceled" &&
    balance !== null &&
    balance.remaining <= LOW_BALANCE_THRESHOLD;

  const banner = React.useMemo<BannerItem | null>(() => {
    if (!shouldShow) return null;
    return {
      id: BANNER_ID,
      variant: "warning",
      icon: <EmptyWalletIcon />,
      title: "No credits left",
      subtitle: "Top up to continue using AI.",
      action: { label: "Top up", onClick: () => void handleTopUp() },
      dismissible: "session",
    };
  }, [shouldShow, handleTopUp]);

  useBannerRegister(banner);

  return null;
}
