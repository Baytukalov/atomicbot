import type { DeploymentInfo, SubscriptionInfo } from "@ipc/backendApi";

export type SetupMode = "paid" | "self-managed";

export type AutoTopUpState = {
  enabled: boolean;
  thresholdUsd: number;
  topupAmountUsd: number;
  monthlyCapUsd: number | null;
  hasPaymentMethod: boolean;
  currentMonthSpentUsd: number;
};

export const DEFAULT_AUTO_TOP_UP_SETTINGS: AutoTopUpState = {
  enabled: true,
  thresholdUsd: 2,
  topupAmountUsd: 10,
  monthlyCapUsd: 300,
  hasPaymentMethod: false,
  currentMonthSpentUsd: 0,
};

export type AuthSliceState = {
  mode: SetupMode | null;
  jwt: string | null;
  email: string | null;
  userId: string | null;
  balance: { remaining: number; limit: number; usage: number } | null;
  deployment: DeploymentInfo | null;
  subscription: SubscriptionInfo | null;
  loading: boolean;
  error: string | null;
  lastRefreshAt: number | null;
  refreshInFlight: boolean;
  refreshError: string | null;
  nextAllowedAt: number | null;
  refreshFailureCount: number;
  topUpPending: boolean;
  topUpError: string | null;
  balancePolling: boolean;
  autoTopUp: AutoTopUpState;
  autoTopUpLoading: boolean;
  autoTopUpSaving: boolean;
  autoTopUpError: string | null;
  autoTopUpLoaded: boolean;
};

export type AuthRefreshReason = "immediate" | "interval" | "focus" | "visibility";

export type SelfManagedBackup = {
  credentials: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  };
  configAuth: {
    profiles?: Record<string, unknown>;
    order?: Record<string, unknown>;
  };
  configModel: {
    primary?: string;
    models?: Record<string, unknown>;
  };
  savedAt: string;
};

export type ConfigSnapshot = {
  config: Record<string, unknown>;
  hash?: string;
  exists?: boolean;
};

export type PersistedAuthToken = { jwt: string; email: string; userId: string };

export type PaidBackup = {
  authToken: PersistedAuthToken;
  credentials: {
    profiles: Record<string, unknown>;
    order: Record<string, string[]>;
  };
  configAuth: {
    profiles?: Record<string, unknown>;
    order?: Record<string, unknown>;
  };
  configModel: {
    primary?: string;
    models?: Record<string, unknown>;
  };
  savedAt: string;
};
