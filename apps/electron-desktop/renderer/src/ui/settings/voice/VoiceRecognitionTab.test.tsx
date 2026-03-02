// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

// ---- module mocks (hoisted) ----

const mockDesktopApi = {
  whisperModelStatus: vi.fn(() =>
    Promise.resolve({
      modelReady: false,
      binReady: true,
      ffmpegReady: false,
      modelPath: "/mock/model",
      size: 0,
      modelId: "small",
    })
  ),
  whisperModelDownload: vi.fn(() => Promise.resolve({ ok: true, modelPath: "/mock/model" })),
  onWhisperModelDownloadProgress: vi.fn(() => () => {}),
  whisperModelsList: vi.fn(() =>
    Promise.resolve([
      {
        id: "small",
        label: "Small",
        description: "Fast",
        sizeLabel: "~465 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo-q8",
        label: "Large v3 Turbo Q8",
        description: "Balanced",
        sizeLabel: "~874 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        description: "Best",
        sizeLabel: "~1.6 GB",
        downloaded: false,
        size: 0,
      },
    ])
  ),
  whisperTranscribe: vi.fn(),
};

vi.mock("@ipc/desktopApi", () => ({
  getDesktopApiOrNull: () => mockDesktopApi,
  getDesktopApi: () => mockDesktopApi,
  isDesktopApiAvailable: () => true,
}));

const stableRequest = vi.fn(() => Promise.resolve({}));
const stableOnEvent = vi.fn(() => () => {});

vi.mock("../../../gateway/context", () => ({
  useGatewayRpc: vi.fn(() => ({
    client: {},
    connected: true,
    request: stableRequest,
    onEvent: stableOnEvent,
  })),
  GatewayRpcProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ---- imports ----

import { VoiceRecognitionTab } from "./VoiceRecognitionTab";
import { whisperReducer } from "@store/slices/whisperSlice";
import { chatReducer } from "@store/slices/chat/chatSlice";
import { configReducer } from "@store/slices/configSlice";
import { gatewayReducer } from "@store/slices/gatewaySlice";
import { onboardingReducer } from "@store/slices/onboardingSlice";

function createTestStore() {
  return configureStore({
    reducer: {
      chat: chatReducer,
      config: configReducer,
      gateway: gatewayReducer,
      onboarding: onboardingReducer,
      whisper: whisperReducer,
    },
  });
}

function renderWithStore(ui: React.ReactElement) {
  const store = createTestStore();
  return { ...render(<Provider store={store}>{ui}</Provider>), store };
}

describe("VoiceRecognitionTab", () => {
  const mockGw = {
    request: vi.fn(() =>
      Promise.resolve({ config: {}, raw: "{}", error: null })
    ) as unknown as typeof stableRequest,
  };
  const defaultProps = {
    gw: mockGw,
    configSnap: null,
    reload: vi.fn(() => Promise.resolve()),
    onError: vi.fn(),
  };

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mockDesktopApi.whisperModelStatus.mockReset().mockResolvedValue({
      modelReady: false,
      binReady: true,
      ffmpegReady: false,
      modelPath: "/mock/model",
      size: 0,
      modelId: "small",
    });
    mockDesktopApi.whisperModelDownload.mockReset().mockResolvedValue({
      ok: true,
      modelPath: "/mock/model",
    });
    mockDesktopApi.onWhisperModelDownloadProgress.mockReset().mockReturnValue(() => {});
    mockDesktopApi.whisperModelsList.mockReset().mockResolvedValue([
      {
        id: "small",
        label: "Small",
        description: "Fast",
        sizeLabel: "~465 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo-q8",
        label: "Large v3 Turbo Q8",
        description: "Balanced",
        sizeLabel: "~874 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        description: "Best",
        sizeLabel: "~1.6 GB",
        downloaded: false,
        size: 0,
      },
    ]);
    vi.mocked(mockGw.request).mockReset().mockResolvedValue({
      config: {},
      raw: "{}",
      error: null,
    });
  });

  it("renders the Voice Recognition heading", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);
    expect(screen.getByText("Voice Recognition")).toBeTruthy();
  });

  it("renders OpenAI Whisper and Local Whisper options", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);
    expect(screen.getByText("OpenAI Whisper")).toBeTruthy();
    expect(screen.getByText("Local Whisper")).toBeTruthy();
  });

  it("selecting Local Whisper shows compact model radio rows", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    await waitFor(() => {
      screen.getByText("Local Whisper");
    });

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Small")).toBeTruthy();
      expect(screen.getByText("Large v3 Turbo Q8")).toBeTruthy();
      expect(screen.getByText("Large v3 Turbo")).toBeTruthy();
    });

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  it("shows download action for selected model that is not downloaded", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/is not downloaded yet/i)).toBeTruthy();
      expect(screen.getByText(/Download Small/i)).toBeTruthy();
    });
  });

  it("shows ready status when selected model is downloaded", async () => {
    mockDesktopApi.whisperModelsList.mockResolvedValue([
      {
        id: "small",
        label: "Small",
        description: "Fast",
        sizeLabel: "~465 MB",
        downloaded: true,
        size: 465_000_000,
      },
      {
        id: "large-v3-turbo-q8",
        label: "Large v3 Turbo Q8",
        description: "Balanced",
        sizeLabel: "~874 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        description: "Best",
        sizeLabel: "~1.6 GB",
        downloaded: false,
        size: 0,
      },
    ]);

    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/Small is ready/i)).toBeTruthy();
    });
  });

  it("clicking download triggers whisperModelDownload for the selected model", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/Download Small/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Download Small/i));

    await waitFor(() => {
      expect(mockDesktopApi.whisperModelDownload).toHaveBeenCalledWith({ model: "small" });
    });
  });

  it("shows error when download fails with retry button", async () => {
    mockDesktopApi.whisperModelDownload.mockResolvedValue({
      ok: false,
      error: "Network error",
    });

    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText(/Download Small/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Download Small/i));

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeTruthy();
      expect(screen.getByText(/Retry download/i)).toBeTruthy();
    });
  });

  it("does not persist local provider when model is not downloaded", async () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      screen.getByText("Small");
    });

    expect(localStorage.getItem("openclaw:voiceProvider")).toBeNull();
  });

  it("persists local provider immediately when model is already downloaded", async () => {
    mockDesktopApi.whisperModelsList.mockResolvedValue([
      {
        id: "small",
        label: "Small",
        description: "Fast",
        sizeLabel: "~465 MB",
        downloaded: true,
        size: 465_000_000,
      },
      {
        id: "large-v3-turbo-q8",
        label: "Large v3 Turbo Q8",
        description: "Balanced",
        sizeLabel: "~874 MB",
        downloaded: false,
        size: 0,
      },
      {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        description: "Best",
        sizeLabel: "~1.6 GB",
        downloaded: false,
        size: 0,
      },
    ]);

    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("Local Whisper").closest("button")!);

    await waitFor(() => {
      expect(localStorage.getItem("openclaw:voiceProvider")).toBe("local");
    });
  });

  it("does not persist openai provider when API key is missing", async () => {
    localStorage.setItem("openclaw:voiceProvider", "local");
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    fireEvent.click(screen.getByText("OpenAI Whisper").closest("button")!);

    await waitFor(() => {
      screen.getByText(/OpenAI is not configured/i);
    });

    expect(localStorage.getItem("openclaw:voiceProvider")).toBe("local");
  });

  it("persists openai provider immediately when API key is configured", async () => {
    vi.mocked(mockGw.request).mockResolvedValue({
      config: {
        auth: {
          profiles: { p1: { provider: "openai" } },
          order: {},
        },
      },
      raw: "{}",
      error: null,
    });

    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("OpenAI Whisper").closest("button")!);
    });

    await waitFor(() => {
      expect(localStorage.getItem("openclaw:voiceProvider")).toBe("openai");
    });
  });

  it("does not render a standalone Save button", () => {
    renderWithStore(<VoiceRecognitionTab {...defaultProps} />);
    const saveButtons = screen.queryAllByRole("button", { name: /^save$/i });
    expect(saveButtons).toHaveLength(0);
  });
});
