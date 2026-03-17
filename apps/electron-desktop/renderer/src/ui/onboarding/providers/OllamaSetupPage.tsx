import React, { useState } from "react";

import { GlassCard, HeroPageLayout, OnboardingDots, PrimaryButton, TextInput } from "@shared/kit";

export type OllamaMode = "local" | "cloud";

const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";

type ConnectionStatus = "idle" | "testing" | "ok" | "error";

export function OllamaSetupPage(props: {
  totalSteps: number;
  activeStep: number;
  busy: boolean;
  error: string | null;
  onSubmit: (params: { baseUrl: string; apiKey: string; mode: OllamaMode }) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<OllamaMode>("local");
  const [baseUrl, setBaseUrl] = useState(OLLAMA_DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");

  const testConnection = React.useCallback(async () => {
    setConnectionStatus("testing");
    setConnectionError("");
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "");
    try {
      const headers: Record<string, string> = {};
      if (mode === "cloud" && apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
      }
      const res = await fetch(`${normalizedUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        setConnectionStatus("ok");
      } else {
        setConnectionStatus("error");
        setConnectionError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setConnectionStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionError(msg.includes("abort") ? "Connection timed out" : msg);
    }
  }, [baseUrl, apiKey, mode]);

  const handleSubmit = React.useCallback(() => {
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, "") || OLLAMA_DEFAULT_BASE_URL;
    const key = mode === "cloud" ? apiKey.trim() : "ollama-local";
    props.onSubmit({ baseUrl: normalizedUrl, apiKey: key, mode });
  }, [baseUrl, apiKey, mode, props]);

  const canSubmit = mode === "local" || apiKey.trim().length > 0;
  const isBusy = props.busy || connectionStatus === "testing";

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="Ollama setup">
      <GlassCard className="UiApiKeyCard UiGlassCardOnboarding">
        <OnboardingDots totalSteps={props.totalSteps} activeStep={props.activeStep} />

        <div className="UiApiKeyTitle">Configure Ollama</div>
        <div className="UiApiKeySubtitle">
          {mode === "local"
            ? "Connect to a local Ollama instance running on your machine."
            : "Use Ollama Cloud models with your API key, plus local models."}
        </div>

        <div className="UiAuthModeToggle" role="radiogroup" aria-label="Ollama mode">
          <button
            type="button"
            className={`UiAuthModeBtn ${mode === "local" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => setMode("local")}
            disabled={isBusy}
          >
            Local
          </button>
          <button
            type="button"
            className={`UiAuthModeBtn ${mode === "cloud" ? "UiAuthModeBtn--active" : ""}`}
            onClick={() => setMode("cloud")}
            disabled={isBusy}
          >
            Cloud + Local
          </button>
        </div>

        <div className="UiApiKeyInputRow">
          <TextInput
            value={baseUrl}
            onChange={(v) => {
              setBaseUrl(v);
              setConnectionStatus("idle");
            }}
            placeholder={OLLAMA_DEFAULT_BASE_URL}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
            label="Base URL"
          />
        </div>

        {mode === "cloud" && (
          <div className="UiApiKeyInputRow">
            <TextInput
              type="password"
              value={apiKey}
              onChange={setApiKey}
              placeholder="ollama-api-key..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isBusy}
              label="Ollama Cloud API Key"
            />
          </div>
        )}

        {connectionStatus !== "idle" && (
          <div
            className="UiApiKeySubtitle"
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background:
                  connectionStatus === "ok"
                    ? "#22c55e"
                    : connectionStatus === "error"
                      ? "#ef4444"
                      : "rgba(255,255,255,0.3)",
              }}
            />
            <span>
              {connectionStatus === "testing" && "Testing connection..."}
              {connectionStatus === "ok" && "Connected to Ollama"}
              {connectionStatus === "error" && `Connection failed: ${connectionError}`}
            </span>
          </div>
        )}

        <div className="UiApiKeySpacer" aria-hidden="true" />

        <div className="UiApiKeyButtonRow">
          <button className="UiTextButton" disabled={isBusy} onClick={props.onBack} type="button">
            Back
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="UiTextButton"
              disabled={isBusy || !baseUrl.trim()}
              onClick={() => void testConnection()}
              type="button"
            >
              {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
            </button>
            <PrimaryButton
              size="sm"
              disabled={isBusy || !canSubmit}
              loading={props.busy}
              onClick={handleSubmit}
            >
              {props.busy ? "Saving..." : "Continue"}
            </PrimaryButton>
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
