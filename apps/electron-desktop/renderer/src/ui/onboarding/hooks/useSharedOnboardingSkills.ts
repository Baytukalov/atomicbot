/**
 * Shared skill/connection composition extracted from usePaidOnboarding
 * and useWelcomeState.  Both flows wire the same ~13 domain hooks with
 * identical patterns — only the navigation callbacks differ.
 *
 * Parent hooks supply `setError`, `setStatus`, navigation callbacks,
 * and model/config helpers; this hook composes the domain hooks and
 * returns all skill-related props that consumers already depend on.
 */
import type { GatewayRpcLike, ConfigSnapshot } from "./types";
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

type SharedOnboardingSkillsInput = {
  gw: GatewayRpcLike;
  loadConfig: () => Promise<ConfigSnapshot>;
  setError: (value: string | null) => void;
  setStatus: (value: string | null) => void;
  loadModels: () => Promise<void>;
  refreshProviderFlags: () => Promise<void>;
  goSkills: () => void;
  goObsidianPage: () => void;
  goSlackReturn: () => void;
  goTelegramUser: () => void;
  goConnections: () => void;
};

export function useSharedOnboardingSkills({
  gw,
  loadConfig,
  setError,
  setStatus,
  loadModels,
  refreshProviderFlags,
  goSkills,
  goObsidianPage,
  goSlackReturn,
  goTelegramUser,
  goConnections,
}: SharedOnboardingSkillsInput) {
  const skillState = useWelcomeSkillState({ setError, setStatus });
  const { skills, markSkillConnected } = skillState;

  const commonDeps = { gw, loadConfig, setError, setStatus } as const;
  const skillCommon = { ...commonDeps, markSkillConnected, goSkills } as const;

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
    goObsidianPage,
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
    setStatus,
    run: skillState.runMediaUnderstanding,
    markSkillConnected,
    goSkills,
  });

  const { onSlackConnect } = useWelcomeSlack({
    ...commonDeps,
    run: skillState.runSlack,
    markSkillConnected,
    goSlackReturn,
  });

  const telegram = useWelcomeTelegram({
    ...commonDeps,
    goTelegramUser,
    goConnections,
  });

  const gog = useWelcomeGog({ gw });

  const apiKey = useWelcomeApiKey({
    ...commonDeps,
    loadModels,
    refreshProviderFlags,
  });

  return {
    skills,
    markSkillConnected,

    notionBusy: skillState.notionBusy,
    trelloBusy: skillState.trelloBusy,
    githubBusy: skillState.githubBusy,
    obsidianBusy: skillState.obsidianBusy,
    appleNotesBusy: skillState.appleNotesBusy,
    appleRemindersBusy: skillState.appleRemindersBusy,
    webSearchBusy: skillState.webSearchBusy,
    mediaUnderstandingBusy: skillState.mediaUnderstandingBusy,
    slackBusy: skillState.slackBusy,

    goObsidian: obsidian.goObsidian,
    obsidianVaults: obsidian.obsidianVaults,
    obsidianVaultsLoading: obsidian.obsidianVaultsLoading,
    onObsidianRecheck: obsidian.onObsidianRecheck,
    onObsidianSetDefaultAndEnable: obsidian.onObsidianSetDefaultAndEnable,
    selectedObsidianVaultName: obsidian.selectedObsidianVaultName,
    setSelectedObsidianVaultName: obsidian.setSelectedObsidianVaultName,

    channelsProbe: telegram.channelsProbe,
    onTelegramTokenNext: telegram.onTelegramTokenNext,
    onTelegramUserNext: telegram.onTelegramUserNext,
    setTelegramToken: telegram.setTelegramToken,
    setTelegramUserId: telegram.setTelegramUserId,
    telegramStatus: telegram.telegramStatus,
    telegramToken: telegram.telegramToken,
    telegramUserId: telegram.telegramUserId,

    gogAccount: gog.gogAccount,
    gogBusy: gog.gogBusy,
    gogError: gog.gogError,
    gogOutput: gog.gogOutput,
    gogCredentialsSet: gog.gogCredentialsSet,
    gogCredentialsBusy: gog.gogCredentialsBusy,
    gogCredentialsError: gog.gogCredentialsError,
    onGogAuthAdd: gog.onGogAuthAdd,
    onGogAuthList: gog.onGogAuthList,
    onGogSetCredentials: gog.onGogSetCredentials,
    setGogAccount: gog.setGogAccount,

    onNotionApiKeySubmit,
    onTrelloSubmit,
    onGitHubConnect,
    onAppleNotesCheckAndEnable,
    onAppleRemindersAuthorizeAndEnable,
    onWebSearchSubmit,
    onMediaUnderstandingSubmit,
    onSlackConnect,

    saveApiKey: apiKey.saveApiKey,
    saveSetupToken: apiKey.saveSetupToken,
    onMediaProviderKeySubmit: apiKey.onMediaProviderKeySubmit,
  } as const;
}
