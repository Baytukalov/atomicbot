/**
 * Account / Billing tab for Settings.
 * States:
 *  1. paid + jwt + subscription  → balance dashboard
 *  1a. paid + jwt + payment/provisioning pending → waiting spinner
 *  1b. paid + jwt + no subscription → subscribe prompt
 *  2. paid + !jwt → sign-up prompt (Continue with Google)
 *  3. self-managed → fallback (tab should be hidden, but graceful)
 */
import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  storeAuthToken,
  switchToSubscription,
  applySubscriptionKeys,
  handleLogout,
  createAddonCheckout,
  fetchBalance,
  fetchDesktopStatus,
  fetchAutoTopUpSettings,
  patchAutoTopUpSettings,
} from "@store/slices/auth/authSlice";
import { useGatewayRpc } from "@gateway/context";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { SecondaryButton, PrimaryButton, Modal } from "@shared/kit";
import { AutoTopUpControl } from "@shared/billing/AutoTopUpControl";
import { addToastError, addToast } from "@shared/toast";

import googleIcon from "@assets/set-up-skills/Google.svg";
import s from "./AccountTab.module.css";

function formatDollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatSubscriptionPrice(price: SubscriptionPriceInfo | null): string {
  if (!price || !price.amountCents) return "$25/mo";
  const dollars = price.amountCents / 100;
  const interval = price.interval === "year" ? "yr" : "mo";
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}/${interval}`;
}

const PER_MONTH_PLAN_USD = 5;

export function AccountTab() {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const {
    mode,
    jwt,
    email,
    balance,
    subscription,
    lastRefreshAt,
    topUpPending,
    autoTopUp,
    autoTopUpLoading,
    autoTopUpSaving,
    autoTopUpError,
    autoTopUpLoaded,
  } = useAppSelector((st) => st.auth);
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [topUpAmount, setTopUpAmount] = React.useState("10.00");
  const [confirmLogoutOpen, setConfirmLogoutOpen] = React.useState(false);
  const [logoutBusy, setLogoutBusy] = React.useState(false);
  const [subscribeBusy, setSubscribeBusy] = React.useState(false);
  const [subscribePaymentPending, setSubscribePaymentPending] = React.useState(false);
  const [provisioning, setProvisioning] = React.useState(false);
  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

  const jwtRef = React.useRef(jwt);
  React.useEffect(() => {
    jwtRef.current = jwt;
  }, [jwt]);

  const provisionCancelRef = React.useRef(false);
  React.useEffect(() => {
    provisionCancelRef.current = false;
    return () => {
      provisionCancelRef.current = true;
    };
  }, []);

  const hasLoadedStatus = lastRefreshAt !== null;
  const needsSubscription =
    hasLoadedStatus && subscription === null && balance === null && !provisioning;

  // Refresh balance (with sync) when the Account tab is opened.
  React.useEffect(() => {
    if (mode === "paid" && jwt) {
      void dispatch(fetchBalance());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    const unsub = api.onDeepLink((payload) => {
      if (payload.host === "auth" || payload.pathname === "/auth") {
        const { token, email: authEmail, userId, isNewUser } = payload.params;
        if (token && authEmail && userId) {
          void (async () => {
            await dispatch(
              storeAuthToken({
                jwt: token,
                email: decodeURIComponent(authEmail),
                userId,
                isNewUser: isNewUser === "true",
              })
            );
            await dispatch(switchToSubscription({ request: gw.request }));
            try {
              await dispatch(applySubscriptionKeys({ token, request: gw.request })).unwrap();
            } catch (err) {
              console.warn("[AccountTab] Failed to apply subscription keys:", err);
            }
          })();
        }
      } else if (payload.host === "stripe-success") {
        setSubscribePaymentPending(false);
        setProvisioning(true);
        provisionCancelRef.current = false;
        void (async () => {
          const currentJwt = jwtRef.current;
          if (!currentJwt) {
            setProvisioning(false);
            return;
          }
          let attempts = 0;
          while (!provisionCancelRef.current && attempts < 60) {
            attempts++;
            try {
              const status = await backendApi.getStatus(currentJwt);
              if (status.hasKey) {
                try {
                  await dispatch(
                    applySubscriptionKeys({ token: currentJwt, request: gw.request })
                  ).unwrap();
                } catch (e) {
                  console.warn("[AccountTab] Failed to apply subscription keys:", e);
                }
                void dispatch(fetchDesktopStatus());
                setProvisioning(false);
                addToast("Subscription activated!");
                return;
              }
            } catch {
              // Retry on transient errors
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          setProvisioning(false);
          void dispatch(fetchDesktopStatus());
        })();
      }
    });

    return unsub;
  }, [dispatch, gw.request]);

  React.useEffect(() => {
    if (mode !== "paid" || !jwt || autoTopUpLoaded || autoTopUpLoading) {
      return;
    }
    void dispatch(fetchAutoTopUpSettings());
  }, [autoTopUpLoaded, autoTopUpLoading, dispatch, jwt, mode]);

  React.useEffect(() => {
    if (!needsSubscription || subscriptionPrice) return;
    void backendApi
      .getSubscriptionInfo()
      .then(setSubscriptionPrice)
      .catch(() => {});
  }, [needsSubscription, subscriptionPrice]);

  const handleSubscribe = React.useCallback(async () => {
    if (!jwt) return;
    setSubscribeBusy(true);
    try {
      const result = await backendApi.createSetupCheckout(jwt, {});
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      }
      setSubscribePaymentPending(true);
    } catch (err) {
      addToastError(err);
    } finally {
      setSubscribeBusy(false);
    }
  }, [jwt]);

  const handleManageSubscription = React.useCallback(async () => {
    if (!jwt) return;
    setPortalBusy(true);
    try {
      const result = await backendApi.getPortalUrl(jwt);
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.portalUrl);
      }
    } catch (err) {
      addToastError(err);
    } finally {
      setPortalBusy(false);
    }
  }, [jwt]);

  const onLogout = React.useCallback(() => {
    setConfirmLogoutOpen(true);
  }, []);

  const handleConfirmLogout = React.useCallback(async () => {
    setLogoutBusy(true);
    try {
      await dispatch(handleLogout({ request: gw.request })).unwrap();
      addToast("Logged out. Sign in again anytime.");
      setConfirmLogoutOpen(false);
    } catch (err) {
      addToastError(err);
    } finally {
      setLogoutBusy(false);
    }
  }, [dispatch, gw.request]);

  const handleContinueWithGoogle = React.useCallback(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
    const url = `${backendUrl}/auth/google/desktop`;
    const api = getDesktopApiOrNull();
    if (api?.openExternal) {
      void api.openExternal(url);
    }
  }, []);

  const handleTopUp = React.useCallback(async () => {
    const amount = Number.parseFloat(topUpAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      addToast("Enter a valid amount");
      return;
    }

    try {
      const result = await dispatch(createAddonCheckout({ amountUsd: amount })).unwrap();
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      } else {
        window.open(result.checkoutUrl, "_blank");
      }
    } catch (err) {
      addToastError(err);
    }
  }, [dispatch, topUpAmount]);

  const handleAutoTopUpPatch = React.useCallback(
    async (payload: {
      enabled?: boolean;
      thresholdUsd?: number;
      topupAmountUsd?: number;
      monthlyCapUsd?: number | null;
    }) => {
      await dispatch(patchAutoTopUpSettings(payload)).unwrap();
    },
    [dispatch]
  );

  const accountFooterJsx = jwt ? (
    <>
      <div className={s.accountFooter}>
        <div className={s.accountAvatar}>{email ? email.charAt(0).toUpperCase() : "?"}</div>
        <span className={s.accountEmail}>{email}</span>
        <button
          type="button"
          className={s.logoutBtn}
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
      <Modal
        open={confirmLogoutOpen}
        onClose={() => {
          if (logoutBusy) return;
          setConfirmLogoutOpen(false);
        }}
        header="Log out?"
        aria-label="Confirm log out"
      >
        <p className={s.logoutConfirmDescription}>
          You will stay in subscription mode, but your current account session will be signed out.
        </p>
        <div className={s.logoutConfirmActions}>
          <button
            type="button"
            className={s.logoutConfirmCancel}
            onClick={() => setConfirmLogoutOpen(false)}
            disabled={logoutBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.logoutConfirmAccept}
            onClick={() => void handleConfirmLogout()}
            disabled={logoutBusy}
          >
            {logoutBusy ? "Logging out..." : "Log out"}
          </button>
        </div>
      </Modal>
    </>
  ) : null;

  // State 2: paid but not authenticated — sign-up prompt
  if (mode === "paid" && !jwt) {
    return (
      <div className={s.root}>
        <div className={s.signUpCard}>
          <h3 className={s.signUpTitle}>Sign up to continue</h3>
          <p className={s.signUpHint}>Sign in or create your account to continue</p>
          <button type="button" className={s.googleBtn} onClick={handleContinueWithGoogle}>
            <img src={googleIcon} alt="" width={20} height={20} />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  // State 1a: paid + authenticated + payment/provisioning in progress
  if (mode === "paid" && jwt && (subscribePaymentPending || provisioning)) {
    return (
      <div className={s.root}>
        <div className={s.subscribeCard}>
          <span className="UiButtonSpinner" aria-hidden="true" />
          <h3 className={s.subscribeTitle}>
            {subscribePaymentPending ? "Waiting for payment..." : "Setting up your account..."}
          </h3>
          <p className={s.subscribeHint}>
            {subscribePaymentPending
              ? "Complete the checkout in your browser, then return here."
              : "Provisioning your API keys. This may take a moment."}
          </p>
        </div>
        {accountFooterJsx}
      </div>
    );
  }

  // State 1b: paid + authenticated + no subscription — subscribe prompt
  if (mode === "paid" && jwt && needsSubscription) {
    return (
      <div className={s.root}>
        <div className={s.subscribeCard}>
          <h3 className={s.subscribeTitle}>Subscribe to get started</h3>
          <p className={s.subscribeHint}>
            Get AI credits, 200+ integrations, and more with your OpenClaw subscription.
          </p>
          <PrimaryButton
            onClick={() => void handleSubscribe()}
            loading={subscribeBusy}
            disabled={subscribeBusy}
          >
            Subscribe {formatSubscriptionPrice(subscriptionPrice)}
          </PrimaryButton>
        </div>
        {accountFooterJsx}
      </div>
    );
  }

  // State 1: paid + authenticated — balance dashboard
  if (mode === "paid" && jwt) {
    const remaining = balance?.remaining ?? 0;
    const usage = balance?.usage ?? 0;
    const subscriptionExpired =
      subscription?.status === "canceled" || (subscription === null && balance !== null);
    const balanceDepleted =
      !subscriptionExpired &&
      subscription !== null &&
      balance !== null &&
      balance.remaining <= 0.05;
    const showRedBalance = subscriptionExpired || balanceDepleted;

    return (
      <div className={s.root}>
        <div className={s.balanceCard}>
          <div className={s.balanceHeader}>
            <h3 className={s.balanceTitle}>Balance</h3>
            <button
              type="button"
              className={s.manageLink}
              onClick={handleManageSubscription}
              disabled={portalBusy}
            >
              Manage
            </button>
          </div>

          <div className={s.balanceHero}>
            <span
              className={`${s.balanceAmount}${showRedBalance ? ` ${s["balanceAmount--expired"]}` : ""}`}
            >
              {showRedBalance ? "$0" : formatDollars(remaining)}
            </span>
            <span className={s.balanceLabel}>Remaining credits</span>
            <span className={s.infoIcon} title="Credits remaining on your plan">
              &#9432;
            </span>
          </div>

          {subscriptionExpired && (
            <div className={s.expiredCard}>
              <div className={s.expiredBody}>
                <div className={s.expiredTitle}>Subscription expired</div>
                <div className={s.expiredSubtitle}>
                  Subscription paused. Renew to restore access.
                </div>
              </div>
              <button
                type="button"
                className={s.expiredAction}
                onClick={() => {
                  if (subscription === null) {
                    void handleSubscribe();
                  } else {
                    void handleManageSubscription();
                  }
                }}
              >
                Renew now
              </button>
            </div>
          )}

          {balanceDepleted && (
            <div className={s.expiredCard}>
              <div className={s.expiredBody}>
                <div className={s.expiredTitle}>No credits left</div>
                <div className={s.expiredSubtitle}>Top up to continue using AI.</div>
              </div>
              <button type="button" className={s.expiredAction} onClick={() => void handleTopUp()}>
                Top up
              </button>
            </div>
          )}

          <div className={s.statsRow}>
            <div className={s.statBox}>
              <span className={s.statLabel}>Used today</span>
              <span className={s.statValue}>{formatDollars(0)}</span>
            </div>
            <div className={s.statBox}>
              <span className={s.statLabel}>Used this month</span>
              <span className={s.statValue}>{formatDollars(usage)}</span>
            </div>
            <div className={s.statBox}>
              <span className={s.statLabel}>Per month plan</span>
              <span className={s.statValue}>{formatDollars(PER_MONTH_PLAN_USD)}</span>
            </div>
          </div>
        </div>

        <AutoTopUpControl
          settings={autoTopUp}
          loading={autoTopUpLoading}
          saving={autoTopUpSaving}
          error={autoTopUpError}
          onPatch={handleAutoTopUpPatch}
          onError={addToastError}
          title="Auto refill credits"
        />

        <div className={s.topUpSection}>
          <h3 className={s.topUpTitle}>One-Time Top-Up</h3>
          <div className={s.topUpRow}>
            <div className={s.topUpInputWrap}>
              <span className={s.topUpCurrency}>$</span>
              <input
                type="number"
                className={s.topUpInput}
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                min={0.01}
                step={0.01}
              />
            </div>
            <SecondaryButton onClick={() => void handleTopUp()} disabled={topUpPending}>
              {topUpPending ? "Opening..." : "Top Up"}
            </SecondaryButton>
          </div>
        </div>

        {accountFooterJsx}
      </div>
    );
  }

  // State 3: self-managed fallback (tab should be hidden)
  return (
    <div className={s.root}>
      <div className={s.balanceCard}>
        <h3 className={s.balanceTitle}>Account</h3>
        <p className={s.selfManagedHint}>
          You are in self-managed mode. Switch to subscription in the Other tab to use managed AI
          models.
        </p>
      </div>
    </div>
  );
}
