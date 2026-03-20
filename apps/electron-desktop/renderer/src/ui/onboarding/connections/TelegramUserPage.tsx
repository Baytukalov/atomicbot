import React from "react";

import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function TelegramUserPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  telegramUserId: string;
  setTelegramUserId: (value: string) => void;
  channelsProbe: unknown;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [errorText, setErrorText] = React.useState("");
  const token = props.telegramUserId.trim();

  const handleSubmit = () => {
    if (errorText) {
      setErrorText("");
    }

    if (token) {
      props.onNext();
    } else {
      setErrorText("Please enter your token to continue");
    }
  };

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Telegram allowlist setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onSkip}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Allow Telegram DMs</div>

        <div className="UiContentWrapper scrollable">
          <div className="UiApiKeySubtitle">
            Get your Telegram user id.{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://t.me/BotFather");
              }}
            >
              Open BotFather ↗
            </a>
          </div>

          <div className="UiSectionSubtitle">
            <div className="UiSectionSubtitleAccent">Follow these steps</div>
            <ol>
              <li>Open the bot by clicking on the BotFather message</li>
              <li>Click the Start button</li>
              <li>Send a message to your bot</li>
              <li>Copy your Telegram user id</li>
              <li>Paste the token in the field below and click Connect</li>
            </ol>

            <div className="UiApiKeySpacer" aria-hidden="true" />
          </div>

          <div className="UiApiKeyInputRow" style={{ marginBottom: 6 }}>
            <TextInput
              value={props.telegramUserId}
              onChange={props.setTelegramUserId}
              placeholder="123456789"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              isError={errorText}
              label={"Telegram user id"}
            />
          </div>
        </div>

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton size="sm" onClick={handleSubmit}>
            Connect
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
