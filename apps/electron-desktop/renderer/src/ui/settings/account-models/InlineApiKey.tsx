/**
 * Inline API key entry/status section for the AI Models tab.
 * Shows configured status or an input field for entering/replacing a key.
 * For OAuth providers, shows a "Connect" button that opens OAuthModalContent in a modal.
 *
 * @deprecated Part of the legacy AccountModels tab — scheduled for removal.
 */
import React from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, TextInput, Modal, CheckIcon } from "@shared/kit";
import { openExternal } from "@shared/utils/openExternal";
import type { ModelProviderInfo, ModelProvider } from "@shared/models/providers";
import { OAuthModalContent } from "../providers/OAuthModalContent";
import { InlineOllamaConfig } from "./InlineOllamaConfig";
import s from "./AccountModelsTab.module.css";

type AuthMode = "api_key" | "setup_token";

const ANTHROPIC_SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const ANTHROPIC_SETUP_TOKEN_MIN_LENGTH = 80;

function validateSetupToken(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "Please paste your setup token";
  }
  if (!trimmed.startsWith(ANTHROPIC_SETUP_TOKEN_PREFIX)) {
    return `Token should start with ${ANTHROPIC_SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < ANTHROPIC_SETUP_TOKEN_MIN_LENGTH) {
    return "Token looks too short — paste the full setup-token";
  }
  return undefined;
}

function supportsSetupToken(providerId: string): boolean {
  return providerId === "anthropic";
}

export function InlineApiKey(props: {
  provider: ModelProviderInfo;
  configured: boolean;
  busy: boolean;
  onSave: (provider: ModelProvider, key: string) => Promise<void>;
  onSaveSetupToken: (provider: ModelProvider, token: string) => Promise<void>;
  onSaveOllama?: (params: { baseUrl: string; apiKey: string; mode: string }) => void;
  onRefreshModels?: () => Promise<void>;
  onPaste: () => Promise<string>;
  configHash: string | null;
  onOAuthSuccess: () => void;
}) {
  const { provider, configured, busy } = props;

  const isOAuth = provider.authType === "oauth";
  const isOllama = provider.authType === "ollama";
  const hasTokenMode = supportsSetupToken(provider.id);

  const [editing, setEditing] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<AuthMode>("api_key");
  const [draftKey, setDraftKey] = React.useState("");
  const [draftToken, setDraftToken] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [validationError, setValidationError] = React.useState("");
  const [oauthModalOpen, setOauthModalOpen] = React.useState(false);

  // Reset edit state when provider changes
  React.useEffect(() => {
    setEditing(false);
    setDraftKey("");
    setDraftToken("");
    setValidationError("");
    setAuthMode("api_key");
  }, [provider.id]);

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setValidationError("");
  };

  const handlePaste = React.useCallback(async () => {
    const text = await props.onPaste();
    if (text) {
      if (authMode === "setup_token") {
        setDraftToken(text);
      } else {
        setDraftKey(text);
      }
      setValidationError("");
    }
  }, [props, authMode]);

  const handleSaveApiKey = React.useCallback(async () => {
    const trimmed = draftKey.trim();
    if (!trimmed) return;

    setValidationError("");
    setValidating(true);
    try {
      const result = await getDesktopApiOrNull()?.validateApiKey(provider.id, trimmed);
      if (result && !result.valid) {
        setValidationError(result.error ?? "Invalid API key.");
        return;
      }
    } catch {
      // If validation IPC is unavailable, allow saving anyway
    } finally {
      setValidating(false);
    }

    await props.onSave(provider.id as ModelProvider, trimmed);
    setEditing(false);
    setDraftKey("");
  }, [draftKey, provider.id, props]);

  const handleSaveSetupToken = React.useCallback(async () => {
    const err = validateSetupToken(draftToken);
    if (err) {
      setValidationError(err);
      return;
    }
    await props.onSaveSetupToken(provider.id as ModelProvider, draftToken.trim());
    setEditing(false);
    setDraftToken("");
  }, [draftToken, provider.id, props]);

  const handleSave = () => {
    if (!currentDraft.trim()) {
      setValidationError("Enter API key to continue");
    }

    if (authMode === "setup_token") {
      void handleSaveSetupToken();
    } else {
      void handleSaveApiKey();
    }
  };

  const isBusy = busy || validating;
  const currentDraft = authMode === "setup_token" ? draftToken : draftKey;
  const showInput = !configured || editing;

  if (isOAuth) {
    return (
      <div className={s.apiKeySection}>
        <div className={s.apiKeyLabel}>Authentication</div>
        {configured ? (
          <div className={s.apiKeyConfiguredRow}>
            <span className={s.apiKeyConfiguredBadge}>Connected</span>
            <ActionButton onClick={() => setOauthModalOpen(true)}>Reconnect</ActionButton>
          </div>
        ) : (
          <ActionButton variant="primary" onClick={() => setOauthModalOpen(true)}>
            Connect
          </ActionButton>
        )}
        <Modal
          open={oauthModalOpen}
          onClose={() => setOauthModalOpen(false)}
          aria-label="Sign in to provider"
        >
          {oauthModalOpen ? (
            <OAuthModalContent
              provider={provider}
              configHash={props.configHash}
              onSuccess={() => {
                setOauthModalOpen(false);
                props.onOAuthSuccess();
              }}
              onClose={() => setOauthModalOpen(false)}
            />
          ) : null}
        </Modal>
      </div>
    );
  }

  if (isOllama && props.onSaveOllama) {
    return (
      <InlineOllamaConfig
        provider={provider}
        busy={busy}
        onSave={props.onSaveOllama}
        onRefreshModels={props.onRefreshModels}
      />
    );
  }

  return (
    <div className={s.apiKeySection}>
      <div className={s.apiKeyLabel}>API Key</div>

      {configured && !editing ? (
        <div className={s.apiKeyConfiguredCard}>
          <div className={s.apiKeyConfiguredIcon}>
            <CheckIcon />
          </div>

          <div className={s.apiKeyConfiguredBody}>
            <h3 className={s.apiKeyConfiguredTitle}>API key configured</h3>
            <p className={s.apiKeyConfiguredHint}>You can edit your API key settings</p>
          </div>
          <ActionButton onClick={() => setEditing(true)} className={s.apiKeyConfiguredButton}>
            Edit
          </ActionButton>
        </div>
      ) : null}

      {showInput ? (
        <>
          {hasTokenMode ? (
            <div className={s.authToggle} role="radiogroup" aria-label="Authentication method">
              <button
                type="button"
                className={`${s.authToggleBtn} ${authMode === "api_key" ? s["authToggleBtn--active"] : ""}`}
                onClick={() => switchAuthMode("api_key")}
                disabled={isBusy}
              >
                I have API key
              </button>
              <button
                type="button"
                className={`${s.authToggleBtn} ${authMode === "setup_token" ? s["authToggleBtn--active"] : ""}`}
                onClick={() => switchAuthMode("setup_token")}
                disabled={isBusy}
              >
                I have Claude subscription
              </button>
            </div>
          ) : null}

          <div className={s.apiKeyHelpText}>
            {authMode === "api_key" ? (
              <>
                {provider.helpText}{" "}
                {provider.helpUrl ? (
                  <a
                    href={provider.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="UiLink"
                    onClick={(e) => {
                      e.preventDefault();
                      if (provider.helpUrl) openExternal(provider.helpUrl);
                    }}
                  >
                    Get API key ↗
                  </a>
                ) : null}
              </>
            ) : (
              <>
                Run <code className={s.inlineCode}>claude setup-token</code> in your terminal, then
                paste the generated token below.{" "}
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code/setup-token"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="UiLink"
                  onClick={(e) => {
                    e.preventDefault();
                    openExternal("https://docs.anthropic.com/en/docs/claude-code/setup-token");
                  }}
                >
                  Learn more ↗
                </a>
              </>
            )}
          </div>

          <div className={s.apiKeyInputRow}>
            {authMode === "api_key" ? (
              <TextInput
                type="password"
                value={draftKey}
                onChange={(v) => {
                  setDraftKey(v);
                  if (validationError) setValidationError("");
                }}
                placeholder={provider.placeholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isBusy}
                isError={validationError}
              />
            ) : (
              <TextInput
                type="password"
                value={draftToken}
                onChange={(v) => {
                  setDraftToken(v);
                  if (validationError) setValidationError("");
                }}
                placeholder="sk-ant-oat01-..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isBusy}
                isError={validationError}
              />
            )}
          </div>

          <div className={s.apiKeyActions}>
            {configured && editing ? (
              <ActionButton
                onClick={() => {
                  setEditing(false);
                  setDraftKey("");
                  setDraftToken("");
                  setValidationError("");
                }}
                disabled={isBusy}
              >
                Cancel
              </ActionButton>
            ) : null}
            <ActionButton disabled={isBusy} onClick={() => void handlePaste()}>
              Paste
            </ActionButton>
            <ActionButton
              variant="primary"
              disabled={isBusy}
              loading={validating}
              onClick={handleSave}
            >
              {validating ? "Validating…" : busy ? "Saving…" : "Save"}
            </ActionButton>
          </div>
        </>
      ) : null}
    </div>
  );
}
