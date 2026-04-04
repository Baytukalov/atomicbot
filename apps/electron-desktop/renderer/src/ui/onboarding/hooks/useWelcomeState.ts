import React from "react";
import type { NavigateFunction } from "react-router-dom";
import { useGatewayRpc } from "@gateway/context";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { setOnboarded } from "@store/slices/onboardingSlice";
import { authActions } from "@store/slices/auth/authSlice";
import { switchMode } from "@store/slices/auth/mode-switch";
import { persistDesktopMode } from "../../shared/persistMode";
import type { GatewayState } from "@main/types";
import { routes } from "../../app/routes";
import type { Provider } from "../providers/ProviderSelectPage";
import { MODEL_PROVIDER_BY_ID } from "@shared/models/providers";
import { setVoiceProvider } from "../../chat/hooks/useVoiceInput";
import { useWelcomeConfig } from "./useWelcomeConfig";
import { useWelcomeModels } from "./useWelcomeModels";
import { useWelcomeNavigation } from "./useWelcomeNavigation";
import { addToastError, errorToMessage } from "@shared/toast";
import { patchAuthProfile } from "../../shared/utils/authProfiles";
import { useSharedOnboardingSkills } from "./useSharedOnboardingSkills";

type WelcomeStateInput = {
  state: Extract<GatewayState, { kind: "ready" }>;
  navigate: NavigateFunction;
};

type OllamaSetupParams = {
  baseUrl: string;
  apiKey: string;
  mode: "local" | "cloud";
};

export function useWelcomeState({ state, navigate }: WelcomeStateInput) {
  const gw = useGatewayRpc();
  const dispatch = useAppDispatch();

  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setErrorState] = React.useState<string | null>(null);
  const setError = React.useCallback((value: string | null) => {
    if (value) {
      addToastError(value);
    }
    setErrorState(value);
  }, []);

  const [selectedProvider, setSelectedProvider] = React.useState<Provider | null>(null);
  const [apiKeyBusy, setApiKeyBusy] = React.useState(false);
  const [savedOllamaParams, setSavedOllamaParams] = React.useState<OllamaSetupParams | null>(null);

  // --- Composed hooks ---

  const nav = useWelcomeNavigation(navigate);
  const { goApiKey, goOAuthProvider, goOllamaSetup, goModelSelect } = nav;

  const goSetupMode = React.useCallback(() => {
    void navigate(`${routes.welcome}/setup-mode`);
  }, [navigate]);

  const config = useWelcomeConfig({
    gw,
    state,
    setError,
    setStatus,
    goProviderSelect: nav.goProviderSelect,
    goSetupMode,
  });
  const { loadConfig, refreshProviderFlags } = config;

  const { loadModels, models, modelsError, modelsLoading, onModelSelect } = useWelcomeModels({
    gw,
    loadConfig,
    setError,
    setStatus,
    goSkills: nav.goSkills,
  });

  // --- Shared skill/connection composition ---

  const shared = useSharedOnboardingSkills({
    gw,
    loadConfig,
    setError,
    setStatus,
    loadModels,
    refreshProviderFlags,
    goSkills: nav.goSkills,
    goObsidianPage: nav.goObsidianPage,
    goSlackReturn: nav.goSlackBack,
    goTelegramUser: nav.goTelegramUser,
    goConnections: nav.goConnections,
  });

  // --- Orchestrator-level handlers ---

  const currentAuthMode = useAppSelector((st) => st.auth.mode);
  const finish = React.useCallback(() => {
    const mode = currentAuthMode === "local-model" ? "local-model" : "self-managed";
    captureRenderer(ANALYTICS_EVENTS.onboardingStep, { step: "finished", flow: mode });

    void (async () => {
      try {
        await dispatch(switchMode({ request: gw.request, target: mode })).unwrap();
      } catch {
        dispatch(authActions.setMode(mode));
        persistDesktopMode(mode);
      }
      void dispatch(setOnboarded(true));
      void navigate(routes.chat, { replace: true });
    })();
  }, [currentAuthMode, dispatch, gw.request, navigate]);

  const goMediaUnderstanding = React.useCallback(() => {
    void refreshProviderFlags();
    void navigate(`${routes.welcome}/media-understanding`);
  }, [navigate, refreshProviderFlags]);

  const onProviderSelect = React.useCallback(
    (provider: Provider) => {
      setSelectedProvider(provider);
      setError(null);
      setStatus(null);
      const info = MODEL_PROVIDER_BY_ID[provider];
      if (info?.authType === "oauth") {
        goOAuthProvider();
      } else if (info?.authType === "ollama") {
        goOllamaSetup();
      } else {
        goApiKey();
      }
    },
    [goApiKey, goOAuthProvider, goOllamaSetup, setError]
  );

  const onOAuthSuccess = React.useCallback(
    async (profileId: string) => {
      try {
        const provider = profileId.split(":")[0] ?? "";
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (baseHash && provider) {
          await patchAuthProfile({
            gw,
            baseHash,
            provider,
            mode: "oauth",
            profileId,
            notePrefix: "Welcome",
          });
          await gw.request("secrets.reload", {});
        }
        await loadModels();
        goModelSelect();
      } catch (err) {
        setError(errorToMessage(err));
      }
    },
    [goModelSelect, gw, loadConfig, loadModels, setError]
  );

  const onApiKeySubmit = React.useCallback(
    async (apiKey: string) => {
      if (!selectedProvider) {
        return;
      }
      setApiKeyBusy(true);
      setError(null);
      try {
        const ok = await shared.saveApiKey(selectedProvider, apiKey);
        if (ok) {
          if (selectedProvider === "openai") {
            setVoiceProvider("openai");
          }
          await loadModels();
          goModelSelect();
        }
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, loadModels, shared.saveApiKey, selectedProvider, setError]
  );

  const onOllamaSubmit = React.useCallback(
    async (params: OllamaSetupParams) => {
      setApiKeyBusy(true);
      setError(null);
      try {
        setSavedOllamaParams(params);
        const snap = await loadConfig();
        const baseHash =
          typeof snap.hash === "string" && snap.hash.trim() ? snap.hash.trim() : null;
        if (!baseHash) {
          throw new Error("Missing config base hash");
        }
        await getDesktopApiOrNull()?.setApiKey("ollama", params.apiKey);
        await gw.request("config.patch", {
          baseHash,
          raw: JSON.stringify(
            {
              models: {
                providers: {
                  ollama: {
                    baseUrl: params.baseUrl,
                    api: "ollama",
                    apiKey: "OLLAMA_API_KEY", // pragma: allowlist secret
                    models: [],
                  },
                },
              },
              auth: {
                profiles: {
                  "ollama:default": { provider: "ollama", mode: "api_key" },
                },
                order: {
                  ollama: ["ollama:default"],
                },
              },
            },
            null,
            2
          ),
          note: "Welcome: configure Ollama provider",
        });
        await gw.request("secrets.reload", {});
        await loadModels();
        goModelSelect();
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, gw, loadConfig, loadModels, setError]
  );

  const retryOllamaSubmit = React.useCallback(async () => {
    if (!savedOllamaParams) {
      await loadModels();
      return;
    }
    await onOllamaSubmit(savedOllamaParams);
  }, [loadModels, onOllamaSubmit, savedOllamaParams]);

  const onSetupTokenSubmit = React.useCallback(
    async (token: string) => {
      if (!selectedProvider) {
        return;
      }
      setApiKeyBusy(true);
      setError(null);
      try {
        const ok = await shared.saveSetupToken(selectedProvider, token);
        if (ok) {
          await loadModels();
          goModelSelect();
        }
      } catch (err) {
        setError(errorToMessage(err));
      } finally {
        setApiKeyBusy(false);
      }
    },
    [goModelSelect, loadModels, shared.saveSetupToken, selectedProvider, setError]
  );

  return {
    // Skill busy flags (from shared)
    appleNotesBusy: shared.appleNotesBusy,
    appleRemindersBusy: shared.appleRemindersBusy,
    githubBusy: shared.githubBusy,
    mediaUnderstandingBusy: shared.mediaUnderstandingBusy,
    notionBusy: shared.notionBusy,
    obsidianBusy: shared.obsidianBusy,
    slackBusy: shared.slackBusy,
    trelloBusy: shared.trelloBusy,
    webSearchBusy: shared.webSearchBusy,
    skills: shared.skills,
    markSkillConnected: shared.markSkillConnected,

    // Navigation (spread)
    ...nav,

    // Config
    configPath: config.configPath,
    hasOpenAiProvider: config.hasOpenAiProvider,
    start: config.start,
    startBusy: config.startBusy,

    // Models
    loadModels,
    models,
    modelsError,
    modelsLoading,

    // Obsidian (from shared)
    goObsidian: shared.goObsidian,
    obsidianVaults: shared.obsidianVaults,
    obsidianVaultsLoading: shared.obsidianVaultsLoading,
    onObsidianRecheck: shared.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: shared.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: shared.selectedObsidianVaultName,
    setSelectedObsidianVaultName: shared.setSelectedObsidianVaultName,

    // Telegram (from shared)
    channelsProbe: shared.channelsProbe,
    onTelegramTokenNext: shared.onTelegramTokenNext,
    onTelegramUserNext: shared.onTelegramUserNext,
    setTelegramToken: shared.setTelegramToken,
    setTelegramUserId: shared.setTelegramUserId,
    telegramStatus: shared.telegramStatus,
    telegramToken: shared.telegramToken,
    telegramUserId: shared.telegramUserId,

    // Gog (from shared)
    gogAccount: shared.gogAccount,
    gogBusy: shared.gogBusy,
    gogError: shared.gogError,
    gogOutput: shared.gogOutput,
    gogCredentialsSet: shared.gogCredentialsSet,
    gogCredentialsBusy: shared.gogCredentialsBusy,
    gogCredentialsError: shared.gogCredentialsError,
    onGogAuthAdd: shared.onGogAuthAdd,
    onGogAuthList: shared.onGogAuthList,
    onGogSetCredentials: shared.onGogSetCredentials,
    setGogAccount: shared.setGogAccount,

    // Handlers from shared domain hooks
    onAppleNotesCheckAndEnable: shared.onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable: shared.onAppleRemindersAuthorizeAndEnable,
    onGitHubConnect: shared.onGitHubConnect,
    onMediaProviderKeySubmit: shared.onMediaProviderKeySubmit,
    onMediaUnderstandingSubmit: shared.onMediaUnderstandingSubmit,
    onNotionApiKeySubmit: shared.onNotionApiKeySubmit,
    onSlackConnect: shared.onSlackConnect,
    onTrelloSubmit: shared.onTrelloSubmit,
    onWebSearchSubmit: shared.onWebSearchSubmit,

    // Orchestrator handlers
    apiKeyBusy,
    error,
    finish,
    goMediaUnderstanding,
    onApiKeySubmit,
    onOllamaSubmit,
    onSetupTokenSubmit,
    onModelSelect,
    onOAuthSuccess,
    onProviderSelect,
    retryOllamaSubmit,
    selectedProvider,
    status,
  };
}
