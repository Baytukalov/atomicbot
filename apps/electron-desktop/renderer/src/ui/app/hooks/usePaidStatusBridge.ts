import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { authActions, fetchBalance } from "@store/slices/auth/authSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { addToast } from "@shared/toast";

const TOPUP_POLL_DELAYS_MS = [0, 200, 500, 1000, 1000, 3000, 5000, 5000, 5000];

export function usePaidStatusBridge(): void {
  const dispatch = useAppDispatch();
  const balance = useAppSelector((s) => s.auth.balance);
  const balanceRef = React.useRef(balance);
  React.useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  React.useEffect(() => {
    const onFocus = () => {
      dispatch(authActions.appFocused());
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        dispatch(authActions.appVisible());
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch]);

  // Globally handle addon-success deep link so balance refreshes regardless
  // of which page the user is on when they return from Stripe.
  // Stripe redirects before the webhook is processed, so we poll until
  // the balance actually increases or we exhaust retries.
  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const pollBalance = async () => {
      const previousRemaining = balanceRef.current?.remaining ?? null;

      for (const delay of TOPUP_POLL_DELAYS_MS) {
        if (cancelled) return;
        if (delay > 0) {
          await new Promise<void>((resolve) => {
            pollTimer = setTimeout(resolve, delay);
          });
        }
        if (cancelled) return;

        try {
          const result = await dispatch(fetchBalance()).unwrap();
          if (previousRemaining === null || result.remaining > previousRemaining) {
            addToast("Balance updated!");
            return;
          }
        } catch {
          // transient error — keep retrying
        }
      }
      // Stripe confirmed success but backend hasn't reflected it yet;
      // the periodic background refresh will pick it up shortly.
      addToast("Balance is being updated...");
    };

    const unsub = api.onDeepLink((payload) => {
      if (payload.host === "addon-success") {
        void pollBalance();
      }
    });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      unsub();
    };
  }, [dispatch]);
}
