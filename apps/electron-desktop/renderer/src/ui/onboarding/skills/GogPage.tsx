import React from "react";

import gw from "../connections/GoogleWorkspace.module.css";
import { openExternal } from "@shared/utils/openExternal";
import { GlassCard, HeroPageLayout, PrimaryButton, TextInput } from "@shared/kit";
import { OnboardingHeader } from "../OnboardingHeader";
import { DEFAULT_GOG_SERVICES } from "../hooks/constants";
import { UiCheckbox } from "@shared/kit/forms";

type ServiceOption = {
  id: string;
  label: string;
  description: string;
};

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Search, read, and send emails",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Create and manage events",
  },
  {
    id: "drive",
    label: "Drive",
    description: "Find and manage files",
  },
  {
    id: "docs",
    label: "Docs",
    description: "Create and update documents",
  },
  {
    id: "sheets",
    label: "Sheets",
    description: "Create and update spreadsheets",
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Search contacts and address book",
  },
];

function parseDefaultServicesCsv(): string[] {
  return DEFAULT_GOG_SERVICES.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const GOOGLE_CLOUD_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials";
const GOOGLE_CLOUD_NEW_PROJECT_URL = "https://console.cloud.google.com/projectcreate";
const GOOGLE_CLOUD_OAUTH_CONSENT_URL =
  "https://console.cloud.google.com/apis/credentials/consent";
const GOOGLE_CLOUD_ENABLE_APIS_URL = "https://console.cloud.google.com/apis/library";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
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

export function GogCredentialsInstructions() {
  return (
    <div className="UiBanner" style={{ marginTop: "16px" }}>
      <div>
        <div className="UiBannerTitle">How to get your credentials</div>
        <ol
          style={{
            color: "#ffffffb2",
            fontSize: "13px",
            lineHeight: "20px",
            margin: "0",
            paddingLeft: "18px",
          }}
        >
          <li style={{ marginBottom: "6px" }}>
            Open the{" "}
            <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
              Google Cloud Console ↗
            </ExternalLink>{" "}
            and sign in. If you do not have a project yet,{" "}
            <ExternalLink href={GOOGLE_CLOUD_NEW_PROJECT_URL}>
              create one ↗
            </ExternalLink>
            .
          </li>
          <li style={{ marginBottom: "6px" }}>
            Enable the APIs you need (Gmail, Calendar, Drive, etc.) in the{" "}
            <ExternalLink href={GOOGLE_CLOUD_ENABLE_APIS_URL}>
              API Library ↗
            </ExternalLink>
            .
          </li>
          <li style={{ marginBottom: "6px" }}>
            Go to{" "}
            <ExternalLink href={GOOGLE_CLOUD_OAUTH_CONSENT_URL}>
              OAuth consent screen ↗
            </ExternalLink>{" "}
            and configure it (choose "External", fill in the app name and your email).
          </li>
          <li style={{ marginBottom: "6px" }}>
            Go to{" "}
            <ExternalLink href={GOOGLE_CLOUD_CONSOLE_URL}>
              Credentials ↗
            </ExternalLink>{" "}
            {"→"} <strong>Create Credentials</strong> {"→"}{" "}
            <strong>OAuth client ID</strong>. Select application type{" "}
            <strong>Desktop app</strong>.
          </li>
          <li>
            Click <strong>Download JSON</strong> (or copy the JSON). Paste it above or
            use the file picker.
          </li>
        </ol>
      </div>
    </div>
  );
}

export function GogPage(props: {
  status: string | null;
  error: string | null;
  gogBusy: boolean;
  gogError: string | null;
  gogOutput: string | null;
  gogAccount: string;
  setGogAccount: (value: string) => void;
  gogCredentialsSet: boolean;
  gogCredentialsBusy: boolean;
  gogCredentialsError: string | null;
  onSetCredentials: (json: string) => Promise<{ ok: boolean }>;
  onRunAuthAdd: (servicesCsv: string) => Promise<{ ok: boolean }>;
  onRunAuthList: () => Promise<unknown>;
  onFinish: () => void;
  onSkip?: () => void;
  onBack: () => void;
  totalSteps: number;
  activeStep: number;
  finishText?: string;
  skipText?: string;
}) {
  const { gogAccount, onRunAuthAdd, onSetCredentials } = props;
  const [_, setConnected] = React.useState(false);
  const [errorText, setErrorText] = React.useState("");
  const [credentialsJson, setCredentialsJson] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [services, setServices] = React.useState<Record<string, boolean>>(() => {
    const defaults = new Set(parseDefaultServicesCsv());
    return Object.fromEntries(SERVICE_OPTIONS.map((s) => [s.id, defaults.has(s.id)]));
  });

  const selectedServices = React.useMemo(
    () => SERVICE_OPTIONS.filter((s) => services[s.id]).map((s) => s.id),
    [services]
  );
  const servicesCsv = selectedServices.join(",");

  const handleSetCredentials = React.useCallback(async () => {
    const trimmed = credentialsJson.trim();
    if (!trimmed) {
      return;
    }
    await onSetCredentials(trimmed);
  }, [credentialsJson, onSetCredentials]);

  const handleFilePick = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setCredentialsJson(text);
    } catch {
      // Best-effort; user can paste manually.
    }
    e.target.value = "";
  }, []);

  const onConnect = React.useCallback(async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (errorText) {
      setErrorText("");
    }
    const account = gogAccount.trim();
    if (!account) {
      setErrorText("Please enter your email address to continue");
      return;
    }
    if (!emailRegex.test(account)) {
      setErrorText("Please enter a valid email address");
      return;
    }
    if (!servicesCsv) {
      return;
    }
    const res = await onRunAuthAdd(servicesCsv);
    if (res.ok) {
      setConnected(true);
    }
  }, [errorText, gogAccount, onRunAuthAdd, servicesCsv]);

  return (
    <HeroPageLayout
      variant="compact"
      align="center"
      aria-label="Google Workspace setup"
      context="onboarding"
    >
      <OnboardingHeader
        totalSteps={props.totalSteps}
        activeStep={props.activeStep}
        onBack={props.onBack}
      />
      <GlassCard className={`${gw.card} UiGlassCardOnboarding`}>
        <div className="UiSectionTitle">Google Workspace</div>
        <div className="UiContentWrapper scrollable">
          {!props.gogCredentialsSet ? (
            <div>
              <div className="UiSectionSubtitle">
                Paste your Google OAuth <code>client_secret.json</code> below. See the
                instructions for how to create one.
              </div>

              <div className={gw.form}>
                <textarea
                  className="UiTextarea"
                  value={credentialsJson}
                  onChange={(e) => setCredentialsJson(e.target.value)}
                  placeholder="Paste your client_secret.json contents here..."
                  rows={6}
                  disabled={props.gogCredentialsBusy}
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
              </div>

              {props.gogCredentialsError && (
                <div className="UiErrorText" style={{ marginTop: "8px" }}>
                  {props.gogCredentialsError}
                </div>
              )}

              <GogCredentialsInstructions />
            </div>
          ) : (
            <div>
              <div className="UiSectionSubtitle">
                Credentials set. Enter your Google account email to connect.
              </div>

              <div className={gw.form}>
                <TextInput
                  type="text"
                  value={props.gogAccount}
                  onChange={props.setGogAccount}
                  placeholder="you@gmail.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={props.gogBusy}
                  label={"Gmail Address"}
                  isError={errorText}
                />

                <div className="UiSectionSubtitle" style={{ margin: "14px 0 0" }}>
                  Enable
                </div>
                <div className={gw.servicesCheckboxes}>
                  {SERVICE_OPTIONS.map((svc) => (
                    <UiCheckbox
                      key={svc.id}
                      checked={Boolean(services[svc.id])}
                      label={svc.label}
                      onChange={(checked) => {
                        setServices((prev) => ({ ...prev, [svc.id]: checked }));
                      }}
                    ></UiCheckbox>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={gw.bottomRow}>
          <div />
          <div className={gw.actions}>
            {!props.gogCredentialsSet ? (
              <>
                <PrimaryButton
                  size={"sm"}
                  disabled={props.gogCredentialsBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose File
                </PrimaryButton>
                <PrimaryButton
                  size={"sm"}
                  disabled={props.gogCredentialsBusy || !credentialsJson.trim()}
                  onClick={() => void handleSetCredentials()}
                >
                  {props.gogCredentialsBusy ? "Setting..." : "Set Credentials"}
                </PrimaryButton>
              </>
            ) : (
              <PrimaryButton
                size={"sm"}
                disabled={props.gogBusy || selectedServices.length === 0}
                onClick={() => void onConnect()}
              >
                {props.gogBusy ? "Connecting..." : "Connect"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
