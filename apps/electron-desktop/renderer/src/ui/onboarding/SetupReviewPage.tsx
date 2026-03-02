import React from "react";

import { GlassCard, HeroPageLayout, OnboardingDots, PrimaryButton } from "@shared/kit";
import { AutoTopUpControl } from "@shared/billing/AutoTopUpControl";
import { formatModelDisplayName } from "@shared/models/modelPresentation";
import type { SubscriptionPriceInfo } from "@ipc/backendApi";
import type { AutoTopUpState } from "@store/slices/auth/authSlice";

import notionIcon from "@assets/set-up-skills/Notion.svg";
import figmaIcon from "@assets/set-up-skills/Figma.svg";
import obsidianIcon from "@assets/set-up-skills/Obsidian.svg";
import slackIcon from "@assets/set-up-skills/Slack.svg";
import googleIcon from "@assets/set-up-skills/Google.svg";

import s from "./SetupReviewPage.module.css";

function formatPrice(price: SubscriptionPriceInfo | null): string {
  if (!price || !price.amountCents) return "$25/mo";
  const dollars = price.amountCents / 100;
  const interval = price.interval === "year" ? "yr" : "mo";
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}/${interval}`;
}

const INTEGRATION_ICONS: { src: string; title: string }[] = [
  { src: notionIcon, title: "Notion" },
  { src: figmaIcon, title: "Figma" },
  { src: obsidianIcon, title: "Obsidian" },
  { src: slackIcon, title: "Slack" },
  { src: googleIcon, title: "Google" },
];

export function SetupReviewPage(props: {
  totalSteps: number;
  activeStep: number;
  selectedModel: string;
  subscriptionPrice: SubscriptionPriceInfo | null;
  onPay: () => void;
  onBack: () => void;
  busy?: boolean;
  paymentPending?: boolean;
  autoTopUp: AutoTopUpState;
  autoTopUpLoading: boolean;
  autoTopUpSaving: boolean;
  autoTopUpError: string | null;
  onAutoTopUpPatch: (payload: {
    enabled?: boolean;
    thresholdUsd?: number;
    topupAmountUsd?: number;
    monthlyCapUsd?: number | null;
  }) => Promise<unknown>;
  onError?: (error: unknown) => void;
}) {
  const priceLabel = formatPrice(props.subscriptionPrice);

  if (props.paymentPending) {
    return (
      <HeroPageLayout variant="compact" align="center" aria-label="Waiting for payment">
        <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
          <div className={s.UiSetupReviewPending}>
            <span className="UiButtonSpinner" aria-hidden="true" />
            <div className={s.UiSetupReviewPendingTitle}>Waiting for payment...</div>
            <div className={s.UiSetupReviewPendingHint}>
              Complete the checkout in your browser, then return here.
            </div>
          </div>
        </GlassCard>
      </HeroPageLayout>
    );
  }

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Setup review">
      <GlassCard className={`UiGlassCardOnboarding ${s.UiSetupReviewCard}`}>
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

        <div className="UiSectionTitle">Your OpenClaw Setup</div>
        <div className="UiSectionSubtitle">Review your subscription before proceeding.</div>

        <div className={s.UiSetupReviewGrid}>
          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>
              AI Model{" "}
              <span className={s.UiSetupReviewInfoIcon} title="Selected model">
                ⓘ
              </span>
            </div>
            <div className={s.UiSetupReviewTileValue}>
              {formatModelDisplayName(props.selectedModel)}
            </div>
          </div>

          <AutoTopUpControl
            className={s.UiSetupReviewAutoTopUp}
            settings={props.autoTopUp}
            loading={props.autoTopUpLoading}
            saving={props.autoTopUpSaving}
            error={props.autoTopUpError}
            title="Auto refill"
            onPatch={props.onAutoTopUpPatch}
            onError={props.onError}
          />

          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>Included integrations</div>
            <div className={s.UiSetupReviewIntegrations}>
              {INTEGRATION_ICONS.map((icon) => (
                <div key={icon.title} className={s.UiSetupReviewIntIconWrap} title={icon.title}>
                  <img src={icon.src} alt={icon.title} />
                </div>
              ))}
              <div className={s.UiSetupReviewIntCountBadge}>200+</div>
            </div>
          </div>

          <div className={s.UiSetupReviewTile}>
            <div className={s.UiSetupReviewTileLabel}>Free Features</div>
            <ul className={s.UiSetupReviewFeatureList}>
              <li>🎤 Voice chat</li>
              <li>🌐 Web search &amp; Browser actions</li>
              <li>📎 Works with files and images</li>
            </ul>
          </div>
        </div>

        <div className="UiProviderContinueRow">
          <div>
            <button className="UiTextButton" type="button" onClick={props.onBack}>
              Back
            </button>
          </div>
          <div>
            <PrimaryButton
              size="sm"
              disabled={props.busy}
              loading={props.busy}
              onClick={props.onPay}
            >
              Subscribe {priceLabel}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
