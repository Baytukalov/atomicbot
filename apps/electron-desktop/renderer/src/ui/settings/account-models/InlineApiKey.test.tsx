// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mockOllamaConfig = vi.fn();

vi.mock("@shared/kit", () => ({
  ActionButton: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    loading?: boolean;
    className?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  TextInput: ({
    value,
    onChange,
    placeholder,
    disabled,
    type,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: string;
    isError?: string;
  }) => (
    <input
      type={type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  ),
  Modal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onClose?: () => void;
  }) => (open ? <div data-testid="modal">{children}</div> : null),
  CheckIcon: () => <span data-testid="check-icon" />,
}));

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => null,
}));

vi.mock("@shared/utils/openExternal", () => ({
  openExternal: vi.fn(),
}));

vi.mock("../providers/OAuthModalContent", () => ({
  OAuthModalContent: () => <div data-testid="oauth-content" />,
}));

vi.mock("./InlineOllamaConfig", () => ({
  InlineOllamaConfig: (props: {
    provider: { id: string };
    busy: boolean;
    onSave: (p: unknown) => void;
  }) => {
    mockOllamaConfig(props);
    return <div data-testid="inline-ollama-config">{props.provider.id}</div>;
  },
}));

vi.mock("./AccountModelsTab.module.css", () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

import { InlineApiKey } from "./InlineApiKey";

const baseProps = {
  configured: false,
  busy: false,
  onSave: vi.fn().mockResolvedValue(undefined),
  onSaveSetupToken: vi.fn().mockResolvedValue(undefined),
  onPaste: vi.fn().mockResolvedValue(""),
  configHash: "hash123",
  onOAuthSuccess: vi.fn(),
};

const apiKeyProvider = {
  id: "openai" as const,
  name: "OpenAI",
  description: "GPT models",
  placeholder: "sk-...",
  helpText: "Enter your OpenAI API key.",
  authType: "api_key" as const,
};

const oauthProvider = {
  id: "google" as const,
  name: "Google",
  description: "Gemini models",
  placeholder: "",
  helpText: "Sign in with Google.",
  authType: "oauth" as const,
};

const ollamaProvider = {
  id: "ollama" as const,
  name: "Ollama",
  description: "Run AI models locally",
  placeholder: "ollama-api-key...",
  helpText: "Run models locally.",
  authType: "ollama" as const,
};

describe("InlineApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders API Key label for standard api_key provider", () => {
    render(<InlineApiKey {...baseProps} provider={apiKeyProvider} />);

    expect(screen.getByText("API Key")).not.toBeNull();
  });

  it("renders OAuth Connect button for oauth provider", () => {
    render(<InlineApiKey {...baseProps} provider={oauthProvider} />);

    expect(screen.getByText("Authentication")).not.toBeNull();
    expect(screen.getByText("Connect")).not.toBeNull();
  });

  it("delegates to InlineOllamaConfig for ollama provider", () => {
    const onSaveOllama = vi.fn();
    render(<InlineApiKey {...baseProps} provider={ollamaProvider} onSaveOllama={onSaveOllama} />);

    expect(screen.getByTestId("inline-ollama-config")).not.toBeNull();
    expect(screen.getByText("ollama")).not.toBeNull();

    expect(mockOllamaConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: ollamaProvider,
        busy: false,
        onSave: onSaveOllama,
      })
    );
  });

  it("passes busy prop through to InlineOllamaConfig", () => {
    render(
      <InlineApiKey {...baseProps} provider={ollamaProvider} busy={true} onSaveOllama={vi.fn()} />
    );

    expect(mockOllamaConfig).toHaveBeenCalledWith(expect.objectContaining({ busy: true }));
  });

  it("falls back to standard API key view if ollama but no onSaveOllama", () => {
    render(<InlineApiKey {...baseProps} provider={ollamaProvider} />);

    expect(screen.queryByTestId("inline-ollama-config")).toBeNull();
    expect(screen.getByText("API Key")).not.toBeNull();
  });

  it("shows configured state for standard api_key provider", () => {
    render(<InlineApiKey {...baseProps} provider={apiKeyProvider} configured={true} />);

    expect(screen.getByText("API key configured")).not.toBeNull();
    expect(screen.getByText("Edit")).not.toBeNull();
  });

  it("shows Connected badge for configured oauth provider", () => {
    render(<InlineApiKey {...baseProps} provider={oauthProvider} configured={true} />);

    expect(screen.getByText("Connected")).not.toBeNull();
    expect(screen.getByText("Reconnect")).not.toBeNull();
  });
});
