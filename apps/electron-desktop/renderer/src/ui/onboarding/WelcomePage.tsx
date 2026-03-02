import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import { clearAuth } from "@store/slices/auth/authSlice";
import type { GatewayState } from "@main/types";
import { routes } from "../app/routes";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { addToastError } from "@shared/toast";
import { ApiKeyPage } from "./providers/ApiKeyPage";
import { OAuthProviderPage } from "./providers/OAuthProviderPage";
import { SetupModePage } from "./providers/SetupModePage";
import { AppleNotesConnectPage } from "./connections/AppleNotesConnectPage";
import { AppleRemindersConnectPage } from "./connections/AppleRemindersConnectPage";
import { GogPage } from "./skills/GogPage";
import { MediaUnderstandingPage } from "./skills/MediaUnderstandingPage";
import { ModelSelectPage } from "./providers/ModelSelectPage";
import { NotionConnectPage } from "./connections/NotionConnectPage";
import { ObsidianConnectPage } from "./connections/ObsidianConnectPage";
import { GitHubConnectPage } from "./connections/GitHubConnectPage";
import { ProviderSelectPage } from "./providers/ProviderSelectPage";
import { ConnectionsSetupPage } from "./connections/ConnectionsSetupPage";
import { SkillsSetupPage } from "./skills/SkillsSetupPage";
import { SlackConnectPage } from "./connections/SlackConnectPage";
import { TrelloConnectPage } from "./connections/TrelloConnectPage";
import { TelegramTokenPage } from "./connections/TelegramTokenPage";
import { TelegramUserPage } from "./connections/TelegramUserPage";
import { WebSearchPage } from "./skills/WebSearchPage";
import { SetupReviewPage } from "./SetupReviewPage";
import { SuccessPage } from "./SuccessPage";
import { RestoreOptionPage } from "./RestoreOptionPage";
import { RestoreFilePage } from "./RestoreFilePage";
import { useWelcomeState } from "./hooks/useWelcomeState";
import { usePaidOnboarding } from "./hooks/usePaidOnboarding";
import { SELF_FLOW, PAID_FLOW, RESTORE_FLOW } from "./hooks/onboardingSteps";

function WelcomeAutoStart(props: {
  startBusy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const didStartRef = React.useRef(false);

  React.useEffect(() => {
    if (didStartRef.current) {
      return;
    }
    didStartRef.current = true;
    props.onStart();
  }, [props.onStart]);

  // While config setup is in progress, render nothing visible to avoid a
  // loading-screen flash between consent and provider-select.
  if (props.startBusy) {
    return null;
  }

  if (props.error) {
    return (
      <HeroPageLayout title="WELCOME" variant="compact" align="center" aria-label="Welcome setup">
        <GlassCard className="UiGlassCard-intro">
          <div className="UiIntroInner">
            <div className="UiSectionTitle">Setup failed.</div>
            <div className="UiSectionSubtitle">Please retry to continue onboarding.</div>
            <PrimaryButton onClick={props.onStart}>Retry</PrimaryButton>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  // If start is neither busy nor errored, we should have navigated away already.
  return null;
}

export function WelcomePage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const welcome = useWelcomeState({ state, navigate });
  const paid = usePaidOnboarding({ navigate });

  React.useEffect(() => {
    if (onboarded) {
      void navigate("/chat", { replace: true });
    }
  }, [navigate, onboarded]);

  return (
    <Routes>
      <Route
        index
        element={
          <WelcomeAutoStart
            startBusy={welcome.startBusy}
            error={welcome.error}
            onStart={() => {
              void welcome.start();
            }}
          />
        }
      />

      {/* ── Paid flow: setup mode selection ── */}
      <Route
        path="setup-mode"
        element={
          <SetupModePage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.auth}
            onSelect={(mode) => {
              if (mode === "paid") {
                void paid.startGoogleAuth();
              } else {
                // Clear any JWT/auth state from a previous paid-flow attempt
                void dispatch(clearAuth());
                welcome.goProviderSelect();
              }
            }}
            onStartGoogleAuth={() => void paid.startGoogleAuth()}
            authBusy={paid.authBusy}
            authError={paid.authError}
            onBack={() => void navigate(routes.consent)}
          />
        }
      />

      <Route
        path="paid-model-select"
        element={
          <ModelSelectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.model}
            models={paid.models}
            filterProvider="openrouter"
            loading={paid.modelsLoading}
            error={paid.modelsError}
            onSelect={(modelId) => void paid.onPaidModelSelect(modelId)}
            onBack={paid.goSetupMode}
            onRetry={() => void paid.loadModels()}
          />
        }
      />

      <Route
        path="setup-review"
        element={
          <SetupReviewPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.review}
            selectedModel={paid.selectedModelName ?? paid.selectedModel ?? "GPT-5.2 Pro"}
            subscriptionPrice={paid.subscriptionPrice}
            onPay={() => void paid.onPay()}
            onBack={paid.goPaidModelSelect}
            busy={paid.payBusy}
            paymentPending={paid.paymentPending}
            autoTopUp={paid.autoTopUp}
            autoTopUpLoading={paid.autoTopUpLoading}
            autoTopUpSaving={paid.autoTopUpSaving}
            autoTopUpError={paid.autoTopUpError}
            onAutoTopUpPatch={paid.onAutoTopUpPatch}
            onError={addToastError}
          />
        }
      />

      <Route
        path="success"
        element={
          paid.jwt ? (
            <SuccessPage jwt={paid.jwt} onStartChat={(key) => void paid.onStartChat(key)} />
          ) : (
            <Navigate to={`${routes.welcome}/setup-mode`} replace />
          )
        }
      />

      {/* ── Paid flow: skills & connections ── */}
      <Route
        path="paid-skills"
        element={
          <SkillsSetupPage
            googleWorkspaceStatus={paid.skills["google-workspace"]}
            onGoogleWorkspaceConnect={paid.goPaidGogGoogleWorkspace}
            mediaUnderstandingStatus={paid.skills["media-understanding"]}
            onMediaUnderstandingConnect={paid.goPaidMediaUnderstanding}
            webSearchStatus={paid.skills["web-search"]}
            onWebSearchConnect={paid.goPaidWebSearch}
            notionStatus={paid.skills.notion}
            onNotionConnect={paid.goPaidNotion}
            trelloStatus={paid.skills.trello}
            onTrelloConnect={paid.goPaidTrello}
            appleNotesStatus={paid.skills["apple-notes"]}
            onAppleNotesConnect={paid.goPaidAppleNotes}
            appleRemindersStatus={paid.skills["apple-reminders"]}
            onAppleRemindersConnect={paid.goPaidAppleReminders}
            obsidianStatus={paid.skills.obsidian}
            onObsidianConnect={paid.goObsidian}
            githubStatus={paid.skills.github}
            onGitHubConnect={paid.goPaidGitHub}
            slackStatus={paid.skills.slack}
            onSlackConnect={paid.goPaidSlackFromSkills}
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            onBack={paid.goPaidModelSelect}
            onSkip={paid.goPaidConnections}
            onContinue={paid.goPaidConnections}
          />
        }
      />

      <Route
        path="paid-connections"
        element={
          <ConnectionsSetupPage
            telegramStatus={paid.telegramStatus}
            onTelegramConnect={paid.goPaidTelegramToken}
            slackStatus={paid.skills.slack}
            onSlackConnect={paid.goPaidSlackFromConnections}
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.connections}
            onBack={paid.goPaidSkills}
            onSkip={() => void paid.onPaidConnectionsContinue()}
            onContinue={() => void paid.onPaidConnectionsContinue()}
          />
        }
      />

      <Route
        path="paid-web-search"
        element={
          <WebSearchPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.webSearchBusy}
            onSubmit={(provider, apiKey) => void paid.onWebSearchSubmit(provider, apiKey)}
            onBack={paid.goPaidSkills}
            onSkip={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-media-understanding"
        element={
          <MediaUnderstandingPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.mediaUnderstandingBusy}
            hasOpenAiProvider={paid.hasOpenAiProvider}
            onSubmit={(settings) => void paid.onMediaUnderstandingSubmit(settings)}
            onAddProviderKey={(provider, apiKey) => paid.onMediaProviderKeySubmit(provider, apiKey)}
            onBack={paid.goPaidSkills}
            onSkip={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-apple-notes"
        element={
          <AppleNotesConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.appleNotesBusy}
            onCheckAndEnable={() => void paid.onAppleNotesCheckAndEnable()}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-apple-reminders"
        element={
          <AppleRemindersConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.appleRemindersBusy}
            onAuthorizeAndEnable={() => void paid.onAppleRemindersAuthorizeAndEnable()}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-obsidian"
        element={
          <ObsidianConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.obsidianBusy}
            vaults={paid.obsidianVaults}
            selectedVaultName={paid.selectedObsidianVaultName}
            setSelectedVaultName={paid.setSelectedObsidianVaultName}
            vaultsLoading={paid.obsidianVaultsLoading}
            onSetDefaultAndEnable={(vaultName) =>
              void paid.onObsidianSetDefaultAndEnable(vaultName)
            }
            onRecheck={() => void paid.onObsidianRecheck()}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-github"
        element={
          <GitHubConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.githubBusy}
            onSubmit={(pat) => void paid.onGitHubConnect(pat)}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-slack"
        element={
          <SlackConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.slackBusy}
            onSubmit={(settings) => void paid.onSlackConnect(settings)}
            onBack={paid.goPaidSlackBack}
          />
        }
      />

      <Route
        path="paid-notion"
        element={
          <NotionConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.notionBusy}
            onSubmit={(apiKey) => void paid.onNotionApiKeySubmit(apiKey)}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-trello"
        element={
          <TrelloConnectPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.skills}
            status={paid.skillStatus}
            error={paid.skillError}
            busy={paid.trelloBusy}
            onSubmit={(apiKey, token) => void paid.onTrelloSubmit(apiKey, token)}
            onBack={paid.goPaidSkills}
          />
        }
      />

      <Route
        path="paid-telegram-token"
        element={
          <TelegramTokenPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.connections}
            status={paid.skillStatus}
            error={paid.skillError}
            telegramToken={paid.telegramToken}
            setTelegramToken={paid.setTelegramToken}
            onNext={() => void paid.onTelegramTokenNext()}
            onSkip={paid.goPaidConnections}
          />
        }
      />

      <Route
        path="paid-telegram-user"
        element={
          <TelegramUserPage
            totalSteps={PAID_FLOW.totalSteps}
            activeStep={PAID_FLOW.steps.connections}
            status={paid.skillStatus}
            error={paid.skillError}
            telegramUserId={paid.telegramUserId}
            setTelegramUserId={paid.setTelegramUserId}
            channelsProbe={paid.channelsProbe}
            onNext={() => void paid.onTelegramUserNext()}
            onSkip={paid.goPaidConnections}
          />
        }
      />

      <Route
        path="paid-gog-google-workspace"
        element={
          <GogPage
            status={paid.skillStatus}
            error={paid.skillError}
            gogBusy={paid.gogBusy}
            gogError={paid.gogError}
            gogOutput={paid.gogOutput}
            gogAccount={paid.gogAccount}
            setGogAccount={paid.setGogAccount}
            onRunAuthAdd={async (servicesCsv) => {
              const res = await paid.onGogAuthAdd(servicesCsv);
              if (res.ok) {
                paid.markSkillConnected("google-workspace");
                paid.goPaidSkills();
              }
              return res;
            }}
            onRunAuthList={() => paid.onGogAuthList()}
            onFinish={paid.goPaidSkills}
            onSkip={paid.goPaidSkills}
            skipText="Back"
          />
        }
      />

      {/* ── Self-managed flow (existing) ── */}
      <Route
        path="provider-select"
        element={
          <ProviderSelectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.provider}
            selectedProvider={welcome.selectedProvider}
            error={welcome.error}
            onSelect={welcome.onProviderSelect}
            onBack={() => void navigate(`${routes.welcome}/setup-mode`)}
          />
        }
      />

      <Route
        path="api-key"
        element={
          welcome.selectedProvider ? (
            <ApiKeyPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.apiKey}
              provider={welcome.selectedProvider}
              status={welcome.status}
              error={welcome.error}
              busy={welcome.apiKeyBusy}
              onSubmit={welcome.onApiKeySubmit}
              onSubmitSetupToken={(token) => void welcome.onSetupTokenSubmit(token)}
              onBack={welcome.goProviderSelect}
            />
          ) : (
            <Navigate to={`${routes.welcome}/provider-select`} replace />
          )
        }
      />

      <Route
        path="oauth-provider"
        element={
          welcome.selectedProvider ? (
            <OAuthProviderPage
              totalSteps={SELF_FLOW.totalSteps}
              activeStep={SELF_FLOW.steps.apiKey}
              provider={welcome.selectedProvider}
              onSuccess={(profileId) => void welcome.onOAuthSuccess(profileId)}
              onBack={welcome.goProviderSelect}
            />
          ) : (
            <Navigate to={`${routes.welcome}/provider-select`} replace />
          )
        }
      />

      <Route
        path="model-select"
        element={
          <ModelSelectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.model}
            models={welcome.models}
            filterProvider={welcome.selectedProvider ?? undefined}
            loading={welcome.modelsLoading}
            error={welcome.modelsError}
            onSelect={(modelId) => void welcome.onModelSelect(modelId)}
            onBack={welcome.goApiKey}
            onRetry={() => void welcome.loadModels()}
          />
        }
      />

      <Route
        path="web-search"
        element={
          <WebSearchPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.webSearchBusy}
            onSubmit={(provider, apiKey) => void welcome.onWebSearchSubmit(provider, apiKey)}
            onBack={welcome.goSkills}
            onSkip={welcome.goSkills}
          />
        }
      />

      <Route
        path="media-understanding"
        element={
          <MediaUnderstandingPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.mediaUnderstandingBusy}
            hasOpenAiProvider={welcome.hasOpenAiProvider}
            onSubmit={(settings) => void welcome.onMediaUnderstandingSubmit(settings)}
            onAddProviderKey={(provider, apiKey) =>
              welcome.onMediaProviderKeySubmit(provider, apiKey)
            }
            onBack={welcome.goSkills}
            onSkip={welcome.goSkills}
          />
        }
      />

      <Route
        path="skills"
        element={
          <SkillsSetupPage
            googleWorkspaceStatus={welcome.skills["google-workspace"]}
            onGoogleWorkspaceConnect={welcome.goGogGoogleWorkspace}
            mediaUnderstandingStatus={welcome.skills["media-understanding"]}
            onMediaUnderstandingConnect={welcome.goMediaUnderstanding}
            webSearchStatus={welcome.skills["web-search"]}
            onWebSearchConnect={welcome.goWebSearch}
            notionStatus={welcome.skills.notion}
            onNotionConnect={welcome.goNotion}
            trelloStatus={welcome.skills.trello}
            onTrelloConnect={welcome.goTrello}
            appleNotesStatus={welcome.skills["apple-notes"]}
            onAppleNotesConnect={welcome.goAppleNotes}
            appleRemindersStatus={welcome.skills["apple-reminders"]}
            onAppleRemindersConnect={welcome.goAppleReminders}
            obsidianStatus={welcome.skills.obsidian}
            onObsidianConnect={welcome.goObsidian}
            githubStatus={welcome.skills.github}
            onGitHubConnect={welcome.goGitHub}
            slackStatus={welcome.skills.slack}
            onSlackConnect={welcome.goSlackFromSkills}
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            onBack={welcome.goModelSelect}
            onSkip={welcome.goConnections}
            onContinue={welcome.goConnections}
          />
        }
      />

      <Route
        path="connections"
        element={
          <ConnectionsSetupPage
            telegramStatus={welcome.telegramStatus}
            onTelegramConnect={welcome.goTelegramToken}
            slackStatus={welcome.skills.slack}
            onSlackConnect={welcome.goSlackFromConnections}
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.connections}
            onBack={welcome.goSkills}
            onSkip={welcome.finish}
            onContinue={welcome.finish}
          />
        }
      />

      <Route
        path="apple-notes"
        element={
          <AppleNotesConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.appleNotesBusy}
            onCheckAndEnable={() => void welcome.onAppleNotesCheckAndEnable()}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="apple-reminders"
        element={
          <AppleRemindersConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.appleRemindersBusy}
            onAuthorizeAndEnable={() => void welcome.onAppleRemindersAuthorizeAndEnable()}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="obsidian"
        element={
          <ObsidianConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.obsidianBusy}
            vaults={welcome.obsidianVaults}
            selectedVaultName={welcome.selectedObsidianVaultName}
            setSelectedVaultName={welcome.setSelectedObsidianVaultName}
            vaultsLoading={welcome.obsidianVaultsLoading}
            onSetDefaultAndEnable={(vaultName) =>
              void welcome.onObsidianSetDefaultAndEnable(vaultName)
            }
            onRecheck={() => void welcome.onObsidianRecheck()}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="github"
        element={
          <GitHubConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.githubBusy}
            onSubmit={(pat) => void welcome.onGitHubConnect(pat)}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="slack"
        element={
          <SlackConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.slackBusy}
            onSubmit={(settings) => void welcome.onSlackConnect(settings)}
            onBack={welcome.goSlackBack}
          />
        }
      />

      <Route
        path="notion"
        element={
          <NotionConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.notionBusy}
            onSubmit={(apiKey) => void welcome.onNotionApiKeySubmit(apiKey)}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="trello"
        element={
          <TrelloConnectPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.skills}
            status={welcome.status}
            error={welcome.error}
            busy={welcome.trelloBusy}
            onSubmit={(apiKey, token) => void welcome.onTrelloSubmit(apiKey, token)}
            onBack={welcome.goSkills}
          />
        }
      />

      <Route
        path="telegram-token"
        element={
          <TelegramTokenPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.connections}
            status={welcome.status}
            error={welcome.error}
            telegramToken={welcome.telegramToken}
            setTelegramToken={welcome.setTelegramToken}
            onNext={() => void welcome.onTelegramTokenNext()}
            onSkip={welcome.goConnections}
          />
        }
      />

      <Route
        path="telegram-user"
        element={
          <TelegramUserPage
            totalSteps={SELF_FLOW.totalSteps}
            activeStep={SELF_FLOW.steps.connections}
            status={welcome.status}
            error={welcome.error}
            telegramUserId={welcome.telegramUserId}
            setTelegramUserId={welcome.setTelegramUserId}
            channelsProbe={welcome.channelsProbe}
            onNext={() => void welcome.onTelegramUserNext()}
            onSkip={welcome.goConnections}
          />
        }
      />

      <Route
        path="gog-google-workspace"
        element={
          <GogPage
            status={welcome.status}
            error={welcome.error}
            gogBusy={welcome.gogBusy}
            gogError={welcome.gogError}
            gogOutput={welcome.gogOutput}
            gogAccount={welcome.gogAccount}
            setGogAccount={welcome.setGogAccount}
            onRunAuthAdd={async (servicesCsv) => {
              const res = await welcome.onGogAuthAdd(servicesCsv);
              if (res.ok) {
                welcome.markSkillConnected("google-workspace");
                welcome.goSkills();
              }
              return res;
            }}
            onRunAuthList={() => welcome.onGogAuthList()}
            onFinish={welcome.goSkills}
            onSkip={welcome.goSkills}
            skipText="Back"
          />
        }
      />

      <Route
        path="restore"
        element={
          <RestoreOptionPage
            totalSteps={RESTORE_FLOW.totalSteps}
            activeStep={RESTORE_FLOW.steps.option}
          />
        }
      />
      <Route
        path="restore-file"
        element={
          <RestoreFilePage
            totalSteps={RESTORE_FLOW.totalSteps}
            activeStep={RESTORE_FLOW.steps.file}
          />
        }
      />

      <Route path="*" element={<Navigate to={routes.welcome} replace />} />
    </Routes>
  );
}
