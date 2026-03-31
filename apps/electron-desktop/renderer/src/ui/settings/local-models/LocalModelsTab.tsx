import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  fetchLlamacppBackendStatus,
  fetchLlamacppServerStatus,
  downloadLlamacppBackend,
  cancelLlamacppBackendDownload,
  checkLlamacppBackendUpdate,
  downloadLlamacppModel,
  cancelLlamacppModelDownload,
  setLlamacppActiveModel,
  llamacppActions,
} from "@store/slices/llamacppSlice";
import { applyLocalModelConfig } from "@store/slices/llamacpp-config";
import { resetSessionModelSelection } from "@store/slices/session-model-reset";
import { reloadConfig } from "@store/slices/configSlice";
import { SecondaryButton } from "@shared/kit";
import qwenIcon from "@assets/ai-models/qwen.svg";
import glmIcon from "@assets/ai-models/glm.svg";
import s from "./LocalModelsTab.module.css";

type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export function LocalModelsTab(props: {
  gatewayRequest?: GatewayRequest;
  onReload?: () => Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const {
    backendDownloaded,
    backendVersion,
    backendDownload,
    models,
    modelDownload,
    serverStatus,
    activeModelId,
    systemInfo,
  } = useAppSelector((st) => st.llamacpp);

  const autoStartedRef = React.useRef(false);
  const [selectingModelId, setSelectingModelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void dispatch(fetchLlamacppModels());
    void dispatch(fetchLlamacppSystemInfo());
    void dispatch(fetchLlamacppServerStatus());

    void (async () => {
      const status = await dispatch(fetchLlamacppBackendStatus()).unwrap();
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;

      if (!status?.downloaded) {
        void dispatch(downloadLlamacppBackend());
      } else {
        const update = await dispatch(checkLlamacppBackendUpdate()).unwrap();
        if (update?.updateAvailable) {
          void dispatch(downloadLlamacppBackend());
        }
      }
    })();
  }, [dispatch]);

  // Clear selecting state when server finishes starting
  React.useEffect(() => {
    if (serverStatus !== "starting") {
      setSelectingModelId(null);
    }
  }, [serverStatus]);

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      setSelectingModelId(modelId);

      const serverResult = await dispatch(setLlamacppActiveModel(modelId)).unwrap();
      void dispatch(fetchLlamacppServerStatus());

      const cfgModelId = serverResult?.modelId ?? modelId;
      const cfgModelName = serverResult?.modelName ?? "Local Model";

      if (props.gatewayRequest) {
        try {
          await applyLocalModelConfig({
            request: props.gatewayRequest,
            modelId: cfgModelId,
            modelName: cfgModelName,
            contextLength: serverResult?.contextLength,
          });
          await resetSessionModelSelection(props.gatewayRequest);
          console.log(`[LocalModelsTab] config.apply OK: llamacpp/${cfgModelId} set as default`);

          if (props.onReload) {
            await props.onReload().catch(() => {});
          } else {
            await dispatch(reloadConfig({ request: props.gatewayRequest }))
              .unwrap()
              .catch(() => {});
          }
        } catch (err) {
          console.error("[LocalModelsTab] config.patch failed:", err);
        }
      }
    },
    [dispatch, props.gatewayRequest, props.onReload]
  );

  return (
    <div className={s.root}>
      {/* Backend status */}
      <div className={s.section}>
        <div className={s.sectionHeader}>
          <div className={s.sectionTitle}>AI Engine</div>
          {backendDownloaded && backendVersion && (
            <div className={s.versionBadge}>{backendVersion}</div>
          )}
        </div>

        {!backendDownloaded && backendDownload.kind !== "downloading" && (
          <SecondaryButton size="sm" onClick={() => void dispatch(downloadLlamacppBackend())}>
            Download AI Engine
          </SecondaryButton>
        )}

        {backendDownload.kind === "downloading" && (
          <div className={s.progressContainer}>
            <div className={s.progressText}>Downloading engine... {backendDownload.percent}%</div>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${backendDownload.percent}%` }} />
            </div>
            <SecondaryButton
              size="sm"
              onClick={() => void dispatch(cancelLlamacppBackendDownload())}
            >
              Cancel
            </SecondaryButton>
          </div>
        )}

        {backendDownload.kind === "error" && (
          <div className={s.errorText}>{backendDownload.message}</div>
        )}
      </div>

      {/* System info */}
      {systemInfo && (
        <div className={s.systemInfo}>
          {systemInfo.totalRamGb} GB RAM &middot;{" "}
          {systemInfo.isAppleSilicon ? "Apple Silicon" : systemInfo.arch}
          {serverStatus === "running" && (
            <span className={s.serverRunning}> &middot; Server running</span>
          )}
        </div>
      )}

      {/* Model list */}
      <div className={s.modelList}>
        {models.map((model) => {
          const isActive = activeModelId === model.id;
          const isDownloading = downloadingModelId === model.id;
          const isSelecting = selectingModelId === model.id && serverStatus === "starting";

          return (
            <div key={model.id} className={`${s.modelRow} ${isActive ? s.modelRowActive : ""}`}>
              <div className={s.modelIcon}>
                <ModelIcon icon={model.icon} />
              </div>
              <div className={s.modelInfo}>
                <div className={s.modelName}>
                  {model.name}
                  {isActive && <span className={s.activeBadge}>Active</span>}
                </div>
                <div className={s.modelMeta}>
                  {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                </div>
                {model.compatibility !== "recommended" && (
                  <span
                    className={`${s.compatBadge} ${
                      model.compatibility === "possible" ? s.compatPossible : s.compatNotRecommended
                    }`}
                  >
                    {model.compatibility === "possible" ? "May be slow" : "Not recommended"}
                  </span>
                )}

                {/* Whisper-style download progress inline */}
                {isDownloading && modelDownload.kind === "downloading" && (
                  <div className={s.downloadProgress}>
                    <div className={s.downloadRow}>
                      <div className={s.downloadLabel}>Downloading… {modelDownload.percent}%</div>
                      <button
                        type="button"
                        className={s.cancelBtn}
                        onClick={() => void dispatch(cancelLlamacppModelDownload())}
                        aria-label="Cancel download"
                      >
                        ✕
                      </button>
                    </div>
                    <div className={s.downloadTrack}>
                      <div
                        className={s.downloadFill}
                        style={{ width: `${modelDownload.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className={s.modelAction}>
                {model.downloaded ? (
                  isActive ? (
                    <div className={s.runningIndicator} />
                  ) : isSelecting ? (
                    <div className={s.selectingLoader} />
                  ) : (
                    <SecondaryButton
                      size="sm"
                      disabled={serverStatus === "starting"}
                      onClick={() => void handleSelect(model.id)}
                    >
                      Select
                    </SecondaryButton>
                  )
                ) : isDownloading ? null : (
                  <SecondaryButton
                    size="sm"
                    onClick={() => void dispatch(downloadLlamacppModel(model.id))}
                    disabled={!backendDownloaded || downloadingModelId !== null}
                  >
                    Download
                  </SecondaryButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Model download error */}
      {modelDownload.kind === "error" && (
        <div className={s.downloadError}>
          <span>Download failed: {modelDownload.message}</span>
          <button
            type="button"
            className={s.cancelBtn}
            onClick={() => dispatch(llamacppActions.setModelDownload({ kind: "idle" }))}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

const MODEL_ICON_MAP: Record<string, string> = {
  qwen: qwenIcon,
  glm: glmIcon,
};

function ModelIcon({ icon }: { icon: string }) {
  const src = MODEL_ICON_MAP[icon];

  if (!src) {
    return <div className={s.modelIconFallback}>{icon.charAt(0).toUpperCase()}</div>;
  }

  return (
    <div className={s.modelIconBox}>
      <img src={src} alt="" width={20} height={20} />
    </div>
  );
}
