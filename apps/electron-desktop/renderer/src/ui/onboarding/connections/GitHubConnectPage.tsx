import React from "react";

import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";

export function GitHubConnectPage(props: {
  totalSteps: number;
  activeStep: number;
  status: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (pat: string) => void;
  onBack: () => void;
}) {
  const [pat, setPat] = React.useState("");
  const [errorText, setErrorText] = React.useState("");

  const handleSubmit = () => {
    if (errorText) {
      setErrorText("");
    }
    const trimmed = pat.trim();
    if (trimmed) {
      props.onSubmit(trimmed);
    } else {
      setErrorText("Please enter your token to continue");
    }
  };

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="GitHub setup" context="onboarding">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
        backDisabled={props.busy}
      />
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <div className="UiApiKeyTitle">Connect GitHub</div>
        <div className="UiApiKeySubtitle">
          Paste a GitHub Personal Access Token (PAT). We'll store it in the app's gh config and
          verify access.
        </div>

        <div className="UiSectionSubtitle">
          Tips:
          <ol>
            <li>Prefer a fine-grained PAT if possible.</li>
            <li>Common scopes: repo, read:org, workflow (adjust to your needs).</li>
          </ol>
        </div>

        {/*{props.status ? <div className="UiSectionSubtitle">{props.status}</div> : null}*/}

        <div className="UiApiKeyInputRow">
          <TextInput
            type="password"
            value={pat}
            onChange={setPat}
            placeholder="ghp_..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={props.busy}
            isError={errorText}
            label={"GitHub Personal Access Token"}
          />
        </div>

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <div />
          <PrimaryButton size="sm" disabled={props.busy} onClick={handleSubmit}>
            {props.busy ? "Connecting..." : "Connect"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
