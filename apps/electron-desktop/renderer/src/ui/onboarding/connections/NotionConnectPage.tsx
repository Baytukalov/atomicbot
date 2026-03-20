import React from "react";

import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function NotionConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (apiKey: string) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [errorText, setErrorText] = React.useState("");

  const handleSubmit = () => {
    if (errorText) {
      setErrorText("");
    }

    const trimmed = apiKey.trim();
    if (trimmed && trimmed.length > 3) {
      props.onSubmit(trimmed);
    } else {
      setErrorText("Please enter your API key to continue");
    }
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Notion setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect Notion</div>

        <div className="UiContentWrapper scrollable">
          <div className="UiApiKeySubtitle">
            Create a Notion integration, copy its API key, then share the target pages/databases
            with the integration.{" "}
            <a
              href="https://notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                openExternal("https://notion.so/my-integrations");
              }}
            >
              Open integrations ↗
            </a>
          </div>

          <div className="UiSectionSubtitle">
            Steps:
            <ol>
              <li>Create an integration.</li>
              <li>Copy the API key (usually starts with ntn_ or secret_).</li>
              <li>Share the pages/databases you want to use with the integration.</li>
            </ol>
          </div>

          {/*{props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}*/}

          <div className="UiApiKeyInputRow">
            <TextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder="ntn_..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={props.busy}
              label={"Notion API key"}
              isError={errorText}
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
