import React from "react";

import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function TrelloConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (apiKey: string, token: string) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [token, setToken] = React.useState("");
  const [errors, setErrors] = React.useState<{
    apiKey?: string;
    token?: string;
  }>({});

  const handleSubmit = () => {
    const trimmedKey = apiKey.trim();
    const trimmedToken = token.trim();

    const nextErrors: typeof errors = {};

    if (!trimmedKey) {
      nextErrors.apiKey = "Please enter your Trello API key";
    }

    if (!trimmedToken) {
      nextErrors.token = "Please enter your Trello token";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    props.onSubmit(trimmedKey, trimmedToken);
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Trello setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Trello</div>

        <div className="UiContentWrapper scrollable">
          <div className="UiApiKeySubtitle">
            Get your Trello API key and token from{" "}
            <a
              href="https://trello.com/app-key"
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://trello.com/app-key");
              }}
            >
              trello.com/app-key ↗
            </a>
          </div>

          <div className="UiSectionSubtitle">
            Steps:
            <ol>
              <li>Open the app key page.</li>
              <li>Copy your API key.</li>
              <li>Click the Token link and generate a token.</li>
              <li>Paste both values here.</li>
            </ol>
          </div>

          {/*{props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}*/}

          <div className="UiApiKeyInputRow" style={{ display: "grid", gap: 10 }}>
            <TextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
              label="Trello API key"
              placeholder="Trello API key"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              isError={errors.apiKey}
            />
            <TextInput
              type="password"
              value={token}
              onChange={setToken}
              label="Trello token"
              placeholder="Trello token"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              isError={errors.token}
            />
          </div>

          <div className="UiApiKeySpacer" aria-hidden="true" />
        </div>

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton size="sm" disabled={props.busy} onClick={handleSubmit}>
            Connect
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
