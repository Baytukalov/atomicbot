/** @deprecated Superseded by AccountModelsTab — scheduled for removal. */
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { settingsStyles as ps } from "../SettingsPage";

import { Modal } from "@shared/kit";
import {
  MODEL_PROVIDER_BY_ID,
  MODEL_PROVIDERS,
  type ModelProvider,
} from "@shared/models/providers";
import type { ConfigData } from "@store/slices/configSlice";
import { ProviderTile } from "./ProviderTile";
import { ApiKeyModalContent } from "./ApiKeyModalContent";
import { OAuthModalContent } from "./OAuthModalContent";
import { OllamaModalContent } from "./OllamaModalContent";
import { ModelsView } from "./ModelsView";
import { useModelProvidersState } from "./useModelProvidersState";

type GatewayRpc = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

type ConfigSnapshotLike = {
  hash?: string;
  config?: ConfigData;
};

export function ModelProvidersTab(props: {
  view: "models" | "providers";
  isPaidMode: boolean;
  gw: GatewayRpc;
  configSnap: ConfigSnapshotLike | null;
  reload: () => Promise<void>;
  onError: (value: string | null) => void;
}) {
  const { view } = props;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleProviderConfigured = React.useCallback(
    (provider: ModelProvider) => {
      navigate(`/settings/ai-models?provider=${provider}`);
    },
    [navigate]
  );

  const state = useModelProvidersState({
    ...props,
    onProviderConfigured: view === "providers" ? handleProviderConfigured : undefined,
  });

  React.useEffect(() => {
    const p = searchParams.get("provider");
    if (!props.isPaidMode && p && MODEL_PROVIDER_BY_ID[p as ModelProvider]) {
      state.setProviderFilter(p as ModelProvider);
    }
    if (p) {
      const next = new URLSearchParams(searchParams);
      next.delete("provider");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const title = view === "models" ? "AI Models" : "Providers & API Keys";

  return (
    <div className={ps.UiSettingsContentInner}>
      <div className={ps.UiSettingsTabTitle}>{title}</div>

      {view === "models" ? (
        <ModelsView state={state} isPaidMode={props.isPaidMode} />
      ) : (
        <ProvidersView state={state} />
      )}

      <Modal
        open={!!state.modalProviderInfo}
        onClose={() => state.setModalProvider(null)}
        aria-label={
          state.modalProviderInfo?.authType === "oauth"
            ? "Sign in to provider"
            : state.modalProviderInfo?.authType === "ollama"
              ? "Configure Ollama"
              : "Enter API key"
        }
      >
        {state.modalProviderInfo ? (
          state.modalProviderInfo.authType === "oauth" ? (
            <OAuthModalContent
              provider={state.modalProviderInfo}
              configHash={typeof props.configSnap?.hash === "string" ? props.configSnap.hash : null}
              onSuccess={() => {
                const providerId = state.modalProviderInfo!.id;
                state.setModalProvider(null);
                void props.reload();
                if (view === "providers") {
                  navigate(`/settings/ai-models?provider=${providerId}`);
                }
              }}
              onClose={() => state.setModalProvider(null)}
            />
          ) : state.modalProviderInfo.authType === "ollama" ? (
            <OllamaModalContent
              provider={state.modalProviderInfo}
              busy={state.busyProvider === state.modalProviderInfo.id}
              onSave={(params) => void state.saveOllamaProvider(params)}
              onClose={() => state.setModalProvider(null)}
            />
          ) : (
            <ApiKeyModalContent
              provider={state.modalProviderInfo}
              busy={state.busyProvider === state.modalProviderInfo.id}
              onSave={(key) => void state.saveProviderApiKey(state.modalProviderInfo!.id, key)}
              onSaveSetupToken={(token) =>
                void state.saveProviderSetupToken(state.modalProviderInfo!.id, token)
              }
              onPaste={state.pasteFromClipboard}
              onClose={() => state.setModalProvider(null)}
            />
          )
        ) : null}
      </Modal>
    </div>
  );
}

function ProvidersView(props: { state: ReturnType<typeof useModelProvidersState> }) {
  const { isProviderConfigured, setModalProvider } = props.state;

  return (
    <div className="UiSkillsScroll" style={{ maxHeight: "none" }}>
      <div className="UiSkillsGrid">
        {MODEL_PROVIDERS.map((p) => (
          <ProviderTile
            key={p.id}
            provider={p}
            configured={isProviderConfigured(p.id)}
            onClick={() => setModalProvider(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
