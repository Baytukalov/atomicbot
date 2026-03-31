import React from "react";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  fetchLlamacppModels,
  fetchLlamacppSystemInfo,
  fetchLlamacppBackendStatus,
  fetchLlamacppServerStatus,
  downloadLlamacppBackend,
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
  const { backendDownloaded, models, modelDownload, serverStatus, activeModelId, systemInfo } =
    useAppSelector((st) => st.llamacpp);

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

  const downloadingModelId = modelDownload.kind === "downloading" ? modelDownload.modelId : null;

  const handleSelect = React.useCallback(
    async (modelId: string) => {
      console.log("[LocalModelsTab] handleSelect:", modelId);
      setSelectingModelId(modelId);

      try {
        const serverResult = await dispatch(setLlamacppActiveModel(modelId)).unwrap();
        console.log("[LocalModelsTab] setActiveModel result:", serverResult);
        void dispatch(fetchLlamacppServerStatus());

        const cfgModelId = serverResult?.modelId ?? modelId;
        const cfgModelName = serverResult?.modelName ?? "Local Model";

        if (props.gatewayRequest) {
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
        }
      } catch (err) {
        console.error("[LocalModelsTab] handleSelect failed:", err);
      } finally {
        setSelectingModelId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when specific prop methods change
    [dispatch, props.gatewayRequest, props.onReload]
  );

  return (
    <div className={s.root}>
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
          const isSelecting = selectingModelId === model.id;

          return (
            <div key={model.id} className={`${s.modelRow} ${isActive ? s.modelRowActive : ""}`}>
              <div className={s.modelIcon}>
                <ModelIcon icon={model.icon} />
              </div>
              <div className={s.modelInfo}>
                <div className={s.modelName}>
                  {model.name}
                  {isActive && <span className={s.activeBadge}>Active</span>}
                  {model.compatibility !== "recommended" && (
                    <span
                      className={`${s.activeBadge} ${
                        model.compatibility === "possible"
                          ? s.compatPossible
                          : s.compatNotRecommended
                      }`}
                    >
                      {model.compatibility === "possible" ? "May be slow" : "Not recommended"}
                    </span>
                  )}
                </div>
                <div className={s.modelMeta}>
                  {model.description} &middot; {model.sizeLabel} &middot; {model.contextLabel}
                </div>

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
                  ) : (
                    <SecondaryButton
                      size="sm"
                      disabled={isSelecting || selectingModelId !== null}
                      onClick={() => void handleSelect(model.id)}
                    >
                      {isSelecting ? "Starting…" : "Select"}
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
