import React from "react";

import sm from "./SkillModal.module.css";
import { DESKTOP_API_UNAVAILABLE, getDesktopApiOrNull } from "@ipc/desktopApi";
import { ActionButton, TextInput } from "@shared/kit";
import { errorToMessage } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";

const DEFAULT_GOG_SERVICES = "gmail,calendar,drive,docs,sheets,contacts";
const GOOGLE_CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";
const GOOGLE_CLOUD_NEW_PROJECT_URL = "https://console.cloud.google.com/projectcreate";
const GOOGLE_CLOUD_OAUTH_CONSENT_URL =
  "https://console.cloud.google.com/apis/credentials/consent";
const GOOGLE_CLOUD_ENABLE_APIS_URL = "https://console.cloud.google.com/apis/library";

type GogExecResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function parseEmailsFromAuthList(stdout: string): string[] {
  const text = (stdout || "").trim();
  if (!text) return [];

  // Try JSON format first (gogAuthList --json)
  try {
    const parsed = JSON.parse(text) as { accounts?: unknown };
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const emails = accounts
      .map((a) => (a && typeof a === "object" ? (a as { email?: unknown }).email : undefined))
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (emails.length > 0) return emails;
  } catch {
    // Not JSON — fall through to line-based parsing.
  }

  // Plain text: extract email-like tokens from each line
  const emailRe = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  const found = text.match(emailRe);
  return found ? [...new Set(found)] : [];
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="UiLink"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

export function GoogleWorkspaceModalContent(props: {
  isConnected: boolean;
  onConnected: () => void;
  onDisabled: () => void;
}) {
  const [account, setAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [errorText, setErrorText] = React.useState("");
  const [credentialsJson, setCredentialsJson] = React.useState("");
  const [credentialsBusy, setCredentialsBusy] = React.useState(false);
  const [credentialsError, setCredentialsError] = React.useState<string | null>(null);
  const [credentialsSet, setCredentialsSet] = React.useState(props.isConnected);
  const [showCredentials, setShowCredentials] = React.useState(!props.isConnected);
  const [connectedEmails, setConnectedEmails] = React.useState<string[]>([]);
  const [showConnectForm, setShowConnectForm] = React.useState(!props.isConnected);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!props.isConnected) {
      return;
    }
    const api = getDesktopApiOrNull();
    if (!api) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.gogAuthList();
        if (cancelled) {
          return;
        }
        if (res.ok && res.stdout?.trim()) {
          const emails = parseEmailsFromAuthList(res.stdout);
          setConnectedEmails(emails);
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.isConnected]);

  const runGog = React.useCallback(async (fn: () => Promise<GogExecResult>) => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.stderr?.trim() || "Google Workspace connection failed");
      }
      return res;
    } catch (err) {
      setError(errorToMessage(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSetCredentials = React.useCallback(async () => {
    const trimmed = credentialsJson.trim();
    if (!trimmed) return;
    const api = getDesktopApiOrNull();
    if (!api) {
      setCredentialsError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    setCredentialsError(null);
    setCredentialsBusy(true);
    try {
      const res = await api.gogAuthCredentials({ credentialsJson: trimmed });
      if (res.ok) {
        setCredentialsSet(true);
        setShowCredentials(false);
      } else {
        setCredentialsError(res.stderr?.trim() || "Failed to set credentials");
      }
    } catch (err) {
      setCredentialsError(errorToMessage(err));
    } finally {
      setCredentialsBusy(false);
    }
  }, [credentialsJson]);

  const handleFilePick = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setCredentialsJson(text);
    } catch {
      // Best-effort.
    }
    e.target.value = "";
  }, []);

  const handleConnect = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api) {
      setError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    try {
      const res = await runGog(() =>
        api.gogAuthAdd({ account: account.trim(), services: DEFAULT_GOG_SERVICES })
      );
      if (res.ok) {
        props.onConnected();
      }
    } catch {
      // Error already set by runGog.
    }
  }, [account, props, runGog]);

  const handleCheck = React.useCallback(async () => {
    if (errorText) {
      setErrorText("");
    }

    const trimmed = account.trim();
    if (!trimmed) {
      setErrorText("Please enter your email to continue");
      return;
    }

    const api = getDesktopApiOrNull();
    if (!api) {
      setError(DESKTOP_API_UNAVAILABLE);
      return;
    }
    try {
      await runGog(() => api.gogAuthList());
    } catch {
      // Error already set by runGog.
    }
  }, [account, errorText, runGog]);

  return (
    <div className={sm.UiSkillModalContent}>
      <div className="UiSectionSubtitle">
        Connects your Google account locally to enable email and calendar skills. Secrets are stored
        locally.
      </div>

      <details open={showCredentials || undefined}>
        <summary
          style={{ cursor: "pointer", fontSize: "13px", fontWeight: 600, marginTop: "12px" }}
          onClick={(e) => {
            e.preventDefault();
            setShowCredentials((prev) => !prev);
          }}
        >
          {credentialsSet ? "Update OAuth credentials" : "Set OAuth credentials"}
        </summary>
        <div style={{ marginTop: "8px" }}>
          <ol
            style={{
              color: "#ffffffb2",
              fontSize: "12px",
              lineHeight: "18px",
              margin: "0 0 10px",
              paddingLeft: "16px",
            }}
          >
            <li style={{ marginBottom: "4px" }}>
              Open the{" "}
              <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
                Google Cloud Console ↗
              </ExternalLink>
              . If needed,{" "}
              <ExternalLink href={GOOGLE_CLOUD_NEW_PROJECT_URL}>
                create a project ↗
              </ExternalLink>
              .
            </li>
            <li style={{ marginBottom: "4px" }}>
              Enable required APIs (Gmail, Calendar, Drive, etc.) in the{" "}
              <ExternalLink href={GOOGLE_CLOUD_ENABLE_APIS_URL}>
                API Library ↗
              </ExternalLink>
              .
            </li>
            <li style={{ marginBottom: "4px" }}>
              Configure the{" "}
              <ExternalLink href={GOOGLE_CLOUD_OAUTH_CONSENT_URL}>
                OAuth consent screen ↗
              </ExternalLink>{" "}
              (External, fill in app name and email).
            </li>
            <li style={{ marginBottom: "4px" }}>
              Go to{" "}
              <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
                Credentials ↗
              </ExternalLink>{" "}
              {"→"} <strong>Create Credentials</strong> {"→"}{" "}
              <strong>OAuth client ID</strong> (Desktop app).
            </li>
            <li>
              Click <strong>Download JSON</strong> and paste it below or use the file picker.
            </li>
          </ol>
          <textarea
            className="UiTextarea"
            value={credentialsJson}
            onChange={(e) => setCredentialsJson(e.target.value)}
            placeholder="Paste your client_secret.json contents here..."
            rows={5}
            disabled={credentialsBusy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "monospace",
              fontSize: "12px",
              resize: "vertical",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid #ffffff14",
              borderRadius: "var(--radius-14)",
              padding: "10px 12px",
              color: "inherit",
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => void handleFilePick(e)}
          />
          {credentialsError && (
            <div className="UiErrorText" style={{ marginTop: "4px" }}>
              {credentialsError}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <ActionButton disabled={credentialsBusy} onClick={() => fileInputRef.current?.click()}>
              Choose File
            </ActionButton>
            <ActionButton
              variant="primary"
              disabled={credentialsBusy || !credentialsJson.trim()}
              onClick={() => void handleSetCredentials()}
            >
              {credentialsBusy ? "Setting..." : "Set Credentials"}
            </ActionButton>
          </div>
        </div>
      </details>

      {props.isConnected && connectedEmails.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <label className={sm.UiSkillModalLabel}>Connected account</label>
          <div
            style={{
              marginTop: "6px",
              padding: "8px 12px",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid #ffffff14",
              borderRadius: "var(--radius-10)",
              fontSize: "13px",
              color: "rgba(230, 237, 243, 0.88)",
            }}
          >
            {connectedEmails.join(", ")}
          </div>
        </div>
      )}

      {credentialsSet && !showConnectForm && props.isConnected && (
        <div style={{ marginTop: "8px" }}>
          <ActionButton onClick={() => setShowConnectForm(true)}>
            Setup another email
          </ActionButton>
        </div>
      )}

      {credentialsSet && showConnectForm && (
        <div className={sm.UiSkillModalField} style={{ marginTop: "16px" }}>
          <label className={sm.UiSkillModalLabel}>Google account email</label>
          <TextInput
            type="text"
            value={account}
            onChange={setAccount}
            placeholder="you@gmail.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            isError={error}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <ActionButton variant="primary" disabled={busy} onClick={() => void handleConnect()}>
              {busy ? "Connecting..." : "Connect"}
            </ActionButton>
          </div>
        </div>
      )}

      {props.isConnected && (
        <div className={sm.UiSkillModalDangerZone}>
          <button
            type="button"
            className={sm.UiSkillModalDisableButton}
            disabled={busy}
            onClick={props.onDisabled}
          >
            Disable
          </button>
        </div>
      )}
    </div>
  );
}
