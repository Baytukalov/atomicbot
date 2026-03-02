import React from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@store/hooks";
import { useGatewayRpc } from "@gateway/context";
import { switchToSubscription } from "@store/slices/auth/authSlice";
import { reloadConfig } from "@store/slices/configSlice";
import { addToastError } from "@shared/toast";
import { routes } from "../../app/routes";
import { useBannerRegister } from "./BannerContext";
import type { BannerItem } from "./types";

const BANNER_ID = "subscription-promo";
const SHOW_DELAY_MS = 5000;

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 2l1.545 4.955L16.5 8.5l-4.955 1.545L10 15l-1.545-4.955L3.5 8.5l4.955-1.545L10 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SubscriptionPromoBannerSource() {
  const authMode = useAppSelector((s) => s.auth.mode);
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const navigate = useNavigate();

  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleTryNow = React.useCallback(async () => {
    try {
      await dispatch(switchToSubscription({ request: gw.request })).unwrap();
      await dispatch(reloadConfig({ request: gw.request }));
      navigate(`${routes.settings}/account`);
    } catch (err) {
      addToastError(err);
    }
  }, [dispatch, gw, navigate]);

  const shouldShow = ready && authMode !== "paid";

  const banner = React.useMemo<BannerItem | null>(() => {
    if (!shouldShow) return null;
    return {
      id: BANNER_ID,
      variant: "info",
      icon: <SparkleIcon />,
      title: "Subscription mode added for easy API Key management",
      subtitle: "Read about it from our CEO",
      action: { label: "Try now", onClick: () => void handleTryNow() },
      dismissible: "persistent",
    };
  }, [shouldShow, handleTryNow]);

  useBannerRegister(banner);

  return null;
}
