/**
 * State orchestrator for the paid "Do everything for me" onboarding flow.
 * Manages: Google OAuth -> model select -> skills -> connections ->
 *          setup review -> Stripe subscription -> success.
 *
 * Model discovery reuses the gateway's models.list RPC (same as self-managed).
 * A placeholder OpenRouter key is saved after Google auth so the gateway can
 * enumerate models; the real key replaces it after Stripe payment completes.
 *
 * Skills and connections configuration reuses the same domain hooks as the
 * self-managed flow (useWelcomeNotion, useWelcomeTelegram, etc.) with
 * paid-specific navigation targets (paid-skills, paid-notion, etc.).
 */
import React from "react";
import type { NavigateFunction } from "react-router-dom";

import { useGatewayRpc } from "@gateway/context";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  storeAuthToken,
  authActions,
  fetchAutoTopUpSettings,
  fetchDesktopStatus,
  patchAutoTopUpSettings,
} from "@store/slices/auth/authSlice";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { backendApi, type SubscriptionPriceInfo } from "@ipc/backendApi";
import { persistDesktopMode } from "../../shared/persistMode";
import { addToastError } from "@shared/toast";

import { routes } from "../../app/routes";
import type { ModelEntry } from "@shared/models/modelPresentation";
import type { ConfigSnapshot, ModelsListResult } from "./types";
import { getObject } from "./utils";

import { useWelcomeSkillState } from "./useWelcomeSkillState";
import { useWelcomeNotion } from "./useWelcomeNotion";
import { useWelcomeTrello } from "./useWelcomeTrello";
import { useWelcomeGitHub } from "./useWelcomeGitHub";
import { useWelcomeObsidian } from "./useWelcomeObsidian";
import { useWelcomeAppleNotes } from "./useWelcomeAppleNotes";
import { useWelcomeAppleReminders } from "./useWelcomeAppleReminders";
import { useWelcomeWebSearch } from "./useWelcomeWebSearch";
import { useWelcomeMediaUnderstanding } from "./useWelcomeMediaUnderstanding";
import { useWelcomeSlack } from "./useWelcomeSlack";
import { useWelcomeTelegram } from "./useWelcomeTelegram";
import { useWelcomeGog } from "./useWelcomeGog";
import { useWelcomeApiKey } from "./useWelcomeApiKey";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://api.atomicbot.ai";
type BackendKeys = { openrouterApiKey: string | null; openaiApiKey: string | null };

type PaidOnboardingInput = {
  navigate: NavigateFunction;
};

export function usePaidOnboarding({ navigate }: PaidOnboardingInput) {
  const dispatch = useAppDispatch();
  const gw = useGatewayRpc();
  const jwt = useAppSelector((s) => s.auth.jwt);
  const { autoTopUp, autoTopUpLoading, autoTopUpSaving, autoTopUpError, autoTopUpLoaded } =
    useAppSelector((s) => s.auth);

  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [payBusy, setPayBusy] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [paymentPending, setPaymentPending] = React.useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = React.useState(false);

  const [subscriptionPrice, setSubscriptionPrice] = React.useState<SubscriptionPriceInfo | null>(
    null
  );

  const [models, setModels] = React.useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

  // Skill/connection operation status and error (separate from auth/pay state)
  const [skillStatus, setSkillStatus] = React.useState<string | null>(null);
  const [skillError, setSkillErrorState] = React.useState<string | null>(null);
  const setSkillError = React.useCallback((value: string | null) => {
    if (value) addToastError(value);
    setSkillErrorState(value);
  }, []);

  const [hasOpenAiProvider, setHasOpenAiProvider] = React.useState(false);

  // ── Gateway config helpers ──

  const loadConfig = React.useCallback(async (): Promise<ConfigSnapshot> => {
    return gw.request<ConfigSnapshot>("config.get");
  }, [gw]);

  const refreshProviderFlags = React.useCallback(async () => {
    try {
      const snap = await loadConfig();
      const cfg = getObject(snap.config);
      const auth = getObject(cfg.auth);
      const profiles = getObject(auth.profiles);
      const order = getObject(auth.order);
      const hasProfile = Object.values(profiles).some((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p)) return false;
        return (p as { provider?: unknown }).provider === "openai";
      });
      const hasOrder = Object.prototype.hasOwnProperty.call(order, "openai");
      setHasOpenAiProvider(Boolean(hasProfile || hasOrder));
    } catch {
      setHasOpenAiProvider(false);
    }
  }, [loadConfig]);

  const savePlaceholderOpenRouterKey = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (api?.setApiKey) {
      await api.setApiKey("openrouter", "pending");
    }
    const snap = await loadConfig();
    const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
    if (!baseHash) {
      throw new Error("Config base hash missing. Reload and try again.");
    }
    const profileId = "openrouter:default";
    await gw.request("config.patch", {
      baseHash,
      raw: JSON.stringify(
        {
          auth: {
            profiles: {
              [profileId]: { provider: "openrouter", mode: "api_key" },
            },
            order: {
              openrouter: [profileId],
            },
          },
        },
        null,
        2
      ),
      note: "Welcome: enable openrouter placeholder for paid flow",
    });
  }, [gw, loadConfig]);

  const loadModels = React.useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await gw.request<ModelsListResult>("models.list", {});
      const entries: ModelEntry[] = (result.models ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: m.provider,
        contextWindow: m.contextWindow,
        reasoning: m.reasoning,
      }));
      setModels(entries);
    } catch (err) {
      setModelsError(String(err));
    } finally {
      setModelsLoading(false);
    }
  }, [gw]);

  const saveDefaultModel = React.useCallback(
    async (modelId: string) => {
      const snap = await loadConfig();
      const baseHash = typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
      if (!baseHash) {
        throw new Error("Config base hash missing. Reload and try again.");
      }
      await gw.request("config.patch", {
        baseHash,
        raw: JSON.stringify(
          {
            agents: {
              defaults: {
                model: { primary: modelId },
                models: { [modelId]: {} },
              },
            },
          },
          null,
          2
        ),
        note: "Welcome: set default model (paid)",
      });
    },
    [gw, loadConfig]
  );

  // ── Skills & Connections state ──

  const skillState = useWelcomeSkillState({ setError: setSkillError, setStatus: setSkillStatus });
  const { skills, markSkillConnected } = skillState;

  // ── Navigation helpers ──

  const goSetupMode = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-mode`);
  }, [navigate]);

  const goPaidModelSelect = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-model-select`);
  }, [navigate]);

  const goSetupReview = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-review`);
  }, [navigate]);

  const goSuccess = React.useCallback(() => {
    void navigate(`${routes.welcome}/success`);
  }, [navigate]);

  const goPaidSkills = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-skills`);
  }, [navigate]);

  const goPaidConnections = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-connections`);
  }, [navigate]);

  const goPaidNotion = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-notion`);
  }, [navigate]);

  const goPaidTrello = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-trello`);
  }, [navigate]);

  const goPaidGitHub = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-github`);
  }, [navigate]);

  const goPaidObsidianPage = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-obsidian`);
  }, [navigate]);

  const goPaidAppleNotes = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-apple-notes`);
  }, [navigate]);

  const goPaidAppleReminders = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-apple-reminders`);
  }, [navigate]);

  const goPaidWebSearch = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-web-search`);
  }, [navigate]);

  const goPaidMediaUnderstanding = React.useCallback(() => {
    void refreshProviderFlags();
    void navigate(`${routes.welcome}/paid-media-understanding`);
  }, [navigate, refreshProviderFlags]);

  const goPaidGogGoogleWorkspace = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-gog-google-workspace`);
  }, [navigate]);

  const goPaidTelegramToken = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-telegram-token`);
  }, [navigate]);

  const goPaidTelegramUser = React.useCallback(() => {
    void navigate(`${routes.welcome}/paid-telegram-user`);
  }, [navigate]);

  const paidSlackReturnToRef = React.useRef<"skills" | "connections">("skills");

  const goPaidSlackFromSkills = React.useCallback(() => {
    paidSlackReturnToRef.current = "skills";
    void navigate(`${routes.welcome}/paid-slack`);
  }, [navigate]);

  const goPaidSlackFromConnections = React.useCallback(() => {
    paidSlackReturnToRef.current = "connections";
    void navigate(`${routes.welcome}/paid-slack`);
  }, [navigate]);

  const goPaidSlackBack = React.useCallback(() => {
    if (paidSlackReturnToRef.current === "connections") {
      goPaidConnections();
      return;
    }
    goPaidSkills();
  }, [goPaidConnections, goPaidSkills]);

  // ── Domain hooks (skill/connection configuration) ──

  const commonDeps = {
    gw,
    loadConfig,
    setError: setSkillError,
    setStatus: setSkillStatus,
  } as const;
  const skillCommon = { ...commonDeps, markSkillConnected, goSkills: goPaidSkills } as const;

  const { onNotionApiKeySubmit } = useWelcomeNotion({
    ...skillCommon,
    run: skillState.runNotion,
  });

  const { onTrelloSubmit } = useWelcomeTrello({
    ...skillCommon,
    run: skillState.runTrello,
  });

  const { onGitHubConnect } = useWelcomeGitHub({
    ...skillCommon,
    run: skillState.runGitHub,
  });

  const obsidian = useWelcomeObsidian({
    ...skillCommon,
    run: skillState.runObsidian,
    goObsidianPage: goPaidObsidianPage,
  });

  const { onAppleNotesCheckAndEnable } = useWelcomeAppleNotes({
    ...skillCommon,
    run: skillState.runAppleNotes,
  });

  const { onAppleRemindersAuthorizeAndEnable } = useWelcomeAppleReminders({
    ...skillCommon,
    run: skillState.runAppleReminders,
  });

  const { onWebSearchSubmit } = useWelcomeWebSearch({
    ...skillCommon,
    run: skillState.runWebSearch,
  });

  const { onMediaUnderstandingSubmit } = useWelcomeMediaUnderstanding({
    gw,
    loadConfig,
    setStatus: setSkillStatus,
    run: skillState.runMediaUnderstanding,
    markSkillConnected,
    goSkills: goPaidSkills,
  });

  const { onSlackConnect } = useWelcomeSlack({
    ...commonDeps,
    run: skillState.runSlack,
    markSkillConnected,
    goSlackReturn: goPaidSlackBack,
  });

  const telegram = useWelcomeTelegram({
    ...commonDeps,
    goTelegramUser: goPaidTelegramUser,
    goConnections: goPaidConnections,
  });

  const gog = useWelcomeGog({ gw });

  const { onMediaProviderKeySubmit } = useWelcomeApiKey({
    ...commonDeps,
    loadModels,
    refreshProviderFlags,
  });

  // ── Flow handlers ──

  const loadSubscriptionPrice = React.useCallback(async () => {
    try {
      const info = await backendApi.getSubscriptionInfo();
      setSubscriptionPrice(info);
    } catch {
      // Non-critical: UI will show a fallback price
    }
  }, []);

  const onStartChat = React.useCallback(
    async (keys: BackendKeys | null) => {
      const api = getDesktopApiOrNull();
      if (api?.setApiKey) {
        if (keys?.openrouterApiKey) {
          await api.setApiKey("openrouter", keys.openrouterApiKey);
        }
        if (keys?.openaiApiKey) {
          await api.setApiKey("openai", keys.openaiApiKey);
        }
      }

      const profiles: Record<string, { provider: string; mode: "api_key" }> = {};
      const order: Record<string, string[]> = {};
      if (keys?.openrouterApiKey) {
        profiles["openrouter:default"] = { provider: "openrouter", mode: "api_key" };
        order.openrouter = ["openrouter:default"];
      }
      if (keys?.openaiApiKey) {
        profiles["openai:default"] = { provider: "openai", mode: "api_key" };
        order.openai = ["openai:default"];
      }
      if (Object.keys(profiles).length > 0) {
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (!baseHash) {
          throw new Error("Config base hash missing. Reload and try again.");
        }
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              auth: {
                profiles,
                order,
              },
            },
            null,
            2
          ),
          note: "Welcome: apply backend-provided provider profiles",
        });
      }

      dispatch(authActions.setMode("paid"));
      persistDesktopMode("paid");
      void dispatch(setOnboarded(true));
      // Eagerly refresh subscription/balance so AccountTab doesn't flash "Subscribe"
      void dispatch(fetchDesktopStatus());
      void navigate(routes.chat, { replace: true });
    },
    [dispatch, gw, loadConfig, navigate]
  );

  const onGoogleAuthSuccess = React.useCallback(
    async (params: { jwt: string; email: string; userId: string; isNewUser: boolean }) => {
      try {
        await dispatch(storeAuthToken(params));

        try {
          const status = await backendApi.getStatus(params.jwt);
          if (status.subscription && status.hasKey) {
            setAlreadySubscribed(true);
          }
        } catch {
          // Status check failed — continue with normal onboarding flow
        }

        await savePlaceholderOpenRouterKey();
        void loadSubscriptionPrice();
        await loadModels();
        goPaidModelSelect();
      } catch (err) {
        setAuthError(String(err));
      } finally {
        setAuthBusy(false);
      }
    },
    [
      dispatch,
      savePlaceholderOpenRouterKey,
      loadSubscriptionPrice,
      loadModels,
      goPaidModelSelect,
      onStartChat,
    ]
  );

  const startGoogleAuth = React.useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const url = `${BACKEND_URL}/auth/google/desktop`;
      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setAuthError(String(err));
      setAuthBusy(false);
    }
  }, []);

  const onPaidModelSelect = React.useCallback(
    async (modelId: string) => {
      setSelectedModel(modelId);
      // modelId is "provider/actualId" from ModelSelectPage; strip leading provider segment
      const actualId = modelId.includes("/") ? modelId.slice(modelId.indexOf("/") + 1) : modelId;
      const entry = models.find((m) => m.id === modelId || m.id === actualId);
      setSelectedModelName(entry?.name ?? null);
      await saveDefaultModel(modelId);
      goPaidSkills();
    },
    [models, saveDefaultModel, goPaidSkills]
  );

  // After connections: already-subscribed users skip payment and go straight to chat
  const onPaidConnectionsContinue = React.useCallback(async () => {
    if (alreadySubscribed && jwt) {
      try {
        const keys = await backendApi.getKeys(jwt);
        await onStartChat(keys);
      } catch {
        await onStartChat(null);
      }
      return;
    }
    goSetupReview();
  }, [alreadySubscribed, jwt, onStartChat, goSetupReview]);

  const onPay = React.useCallback(async () => {
    if (!jwt) {
      setPayError("Not authenticated");
      return;
    }

    setPayBusy(true);
    setPayError(null);

    try {
      const result = await backendApi.createSetupCheckout(jwt, {});

      const api = getDesktopApiOrNull();
      if (api?.openExternal) {
        await api.openExternal(result.checkoutUrl);
      } else {
        window.open(result.checkoutUrl, "_blank");
      }

      setPaymentPending(true);
    } catch (err) {
      setPayError(String(err));
    } finally {
      setPayBusy(false);
    }
  }, [jwt, selectedModel]);

  React.useEffect(() => {
    if (!jwt || autoTopUpLoaded || autoTopUpLoading) {
      return;
    }
    void dispatch(fetchAutoTopUpSettings());
  }, [autoTopUpLoaded, autoTopUpLoading, dispatch, jwt]);

  const onAutoTopUpPatch = React.useCallback(
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

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    const unsub = api.onDeepLink((payload) => {
      if (payload.host === "auth" || payload.pathname === "/auth") {
        const { token, email, userId, isNewUser } = payload.params;
        if (token && email && userId) {
          void onGoogleAuthSuccess({
            jwt: token,
            email: decodeURIComponent(email),
            userId,
            isNewUser: isNewUser === "true",
          });
        } else {
          setAuthError("Authentication failed — missing token data");
          setAuthBusy(false);
        }
      } else if (payload.host === "stripe-success") {
        goSuccess();
      }
    });

    return unsub;
  }, [onGoogleAuthSuccess, goSuccess]);

  return {
    // Auth/pay state
    selectedModel,
    selectedModelName,
    authBusy,
    authError,
    payBusy,
    payError,
    paymentPending,
    alreadySubscribed,
    jwt,
    autoTopUp,
    autoTopUpLoading,
    autoTopUpSaving,
    autoTopUpError,
    backendUrl: BACKEND_URL,
    subscriptionPrice,

    // Model catalog (gateway-sourced)
    models,
    modelsLoading,
    modelsError,
    loadModels,

    // Skill/connection status
    skillStatus,
    skillError,
    skills,
    markSkillConnected,
    hasOpenAiProvider,

    // Skill busy flags
    notionBusy: skillState.notionBusy,
    trelloBusy: skillState.trelloBusy,
    githubBusy: skillState.githubBusy,
    obsidianBusy: skillState.obsidianBusy,
    appleNotesBusy: skillState.appleNotesBusy,
    appleRemindersBusy: skillState.appleRemindersBusy,
    webSearchBusy: skillState.webSearchBusy,
    mediaUnderstandingBusy: skillState.mediaUnderstandingBusy,
    slackBusy: skillState.slackBusy,

    // Navigation
    goSetupMode,
    goPaidModelSelect,
    goSetupReview,
    goSuccess,
    goPaidSkills,
    goPaidConnections,
    goPaidNotion,
    goPaidTrello,
    goPaidGitHub,
    goPaidAppleNotes,
    goPaidAppleReminders,
    goPaidWebSearch,
    goPaidMediaUnderstanding,
    goPaidGogGoogleWorkspace,
    goPaidSlackFromSkills,
    goPaidSlackFromConnections,
    goPaidSlackBack,
    goPaidTelegramToken,

    // Obsidian (spread domain state)
    goObsidian: obsidian.goObsidian,
    obsidianVaults: obsidian.obsidianVaults,
    obsidianVaultsLoading: obsidian.obsidianVaultsLoading,
    onObsidianRecheck: obsidian.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: obsidian.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: obsidian.selectedObsidianVaultName,
    setSelectedObsidianVaultName: obsidian.setSelectedObsidianVaultName,

    // Telegram
    channelsProbe: telegram.channelsProbe,
    onTelegramTokenNext: telegram.onTelegramTokenNext,
    onTelegramUserNext: telegram.onTelegramUserNext,
    setTelegramToken: telegram.setTelegramToken,
    setTelegramUserId: telegram.setTelegramUserId,
    telegramStatus: telegram.telegramStatus,
    telegramToken: telegram.telegramToken,
    telegramUserId: telegram.telegramUserId,

    // Gog (Google Workspace)
    gogAccount: gog.gogAccount,
    gogBusy: gog.gogBusy,
    gogError: gog.gogError,
    gogOutput: gog.gogOutput,
    onGogAuthAdd: gog.onGogAuthAdd,
    onGogAuthList: gog.onGogAuthList,
    setGogAccount: gog.setGogAccount,

    // Skill handlers
    onNotionApiKeySubmit,
    onTrelloSubmit,
    onGitHubConnect,
    onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable,
    onWebSearchSubmit,
    onMediaUnderstandingSubmit,
    onMediaProviderKeySubmit,
    onSlackConnect,

    // Flow handlers
    startGoogleAuth,
    loadSubscriptionPrice,
    onPaidModelSelect,
    onPaidConnectionsContinue,
    onPay,
    onAutoTopUpPatch,
    onStartChat,
  };
}
