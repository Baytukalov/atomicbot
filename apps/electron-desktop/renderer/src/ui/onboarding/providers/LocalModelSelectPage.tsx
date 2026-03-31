import React from "react";

import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
} from "@store/slices/llamacppSlice";
import { GlassCard, HeroPageLayout, PrimaryButton, SecondaryButton } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";
import qwenIcon from "@assets/ai-models/qwen.svg";
import glmIcon from "@assets/ai-models/glm.svg";
import s from "./LocalModelSelectPage.module.css";

export function LocalModelSelectPage(props: {
  totalSteps: number;
  activeStep: number;
  onSelect: (modelId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const dispatch = useAppDispatch();
  const models = useAppSelector((st) => st.llamacpp.models);
  const systemInfo = useAppSelector((st) => st.llamacpp.systemInfo);
  const modelDownload = useAppSelector((st) => st.llamacpp.modelDownload);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
  }, [dispatch]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const handleDownload = React.useCallback(
    (modelId: string) => {
      void (async () => {
        await dispatch(downloadLlamacppModel(modelId)).unwrap();
        props.onSelect(modelId);
      })();
    },
    [dispatch, props]
  );

  const handleCancel = React.useCallback(() => {
    void dispatch(cancelLlamacppModelDownload());
  }, [dispatch]);

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Local model selection">
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />
      <GlassCard className={`UiGlassCardOnboarding ${s.card}`}>
        <div className="UiSectionContent">
          <div>
            <div className="UiSectionTitle">Choose a Model</div>
            <div className="UiSectionSubtitle">
              Select an AI model to run locally.
              {systemInfo && <> Your Mac has {systemInfo.totalRamGb} GB RAM.</>}
            </div>
          </div>

          <div className={s.modelList}>
            {models.map((model) => {
              const isDownloading = downloadingModelId === model.id;
              const compatClass =
                model.compatibility === "recommended"
                  ? s.badgeRecommended
                  : model.compatibility === "possible"
                    ? s.badgePossible
                    : s.badgeNotRecommended;

              const iconMap: Record<string, string> = { qwen: qwenIcon, glm: glmIcon };
              const iconSrc = iconMap[model.icon];

              return (
                <div key={model.id} className={s.modelRow}>
                  {iconSrc && (
                    <div className={s.modelIcon}>
                      <img src={iconSrc} alt="" width={20} height={20} />
                    </div>
                  )}
                  <div className={s.modelInfo}>
                    <div className={s.modelName}>{model.name}</div>
                    <div className={s.modelMeta}>
                      {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                    </div>
                    {model.compatibility !== "recommended" && (
                      <span className={`${s.badge} ${compatClass}`}>
                        {model.compatibility === "possible" ? "May be slow" : "Not recommended"}
                      </span>
                    )}
                  </div>
                  <div className={s.modelAction}>
                    {model.downloaded ? (
                      <PrimaryButton size="sm" onClick={() => props.onSelect(model.id)}>
                        Select
                      </PrimaryButton>
                    ) : isDownloading ? (
                      <SecondaryButton size="sm" onClick={handleCancel}>
                        {modelDownload.kind === "downloading"
                          ? `${modelDownload.percent}%`
                          : "Cancel"}
                      </SecondaryButton>
                    ) : (
                      <SecondaryButton size="sm" onClick={() => handleDownload(model.id)}>
                        Download
                      </SecondaryButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {modelDownload.kind === "downloading" && (
            <div className={s.progressBar}>
              <div className={s.progressHeader}>
                <div className={s.progressText}>Downloading... {modelDownload.percent}%</div>
                <div className={s.progressActions}>
                  <PrimaryButton
                    size="sm"
                    className={s.progressContinueButton}
                    onClick={props.onContinue}
                  >
                    Continue
                  </PrimaryButton>
                </div>
              </div>
              <div className={s.progressTrack}>
                <div className={s.progressFill} style={{ width: `${modelDownload.percent}%` }} />
              </div>
            </div>
          )}

          {modelDownload.kind === "error" && (
            <div style={{ color: "var(--error)", fontSize: 13, marginTop: 8 }}>
              {modelDownload.message}
            </div>
          )}
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
