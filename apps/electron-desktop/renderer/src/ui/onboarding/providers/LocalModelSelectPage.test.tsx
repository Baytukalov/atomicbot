// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LocalModelSelectPage } from "./LocalModelSelectPage";

const mockDispatch = vi.fn();
const mockAddToastError = vi.fn();

const mockFetchLlamacppModels = vi.fn(() => ({ type: "llamacpp/fetchModels" }));
const mockFetchLlamacppSystemInfo = vi.fn(() => ({ type: "llamacpp/fetchSystemInfo" }));
const mockDownloadLlamacppModel = vi.fn((modelId: string) => ({
  type: "llamacpp/downloadModel",
  unwrap: () => Promise.resolve(modelId),
}));
const mockCancelLlamacppModelDownload = vi.fn(() => ({ type: "llamacpp/cancelModelDownload" }));

const mockState = {
  llamacpp: {
    models: [
      {
        id: "qwen-3.5-4b",
        name: "Qwen 3.5 4B",
        description: "Quality-size sweet spot",
        sizeLabel: "2.7 GB",
        contextLabel: "256K",
        downloaded: true,
        size: 1,
        compatibility: "recommended",
        icon: "qwen",
      },
    ],
    systemInfo: {
      totalRamGb: 16,
      arch: "arm64",
      platform: "darwin",
      isAppleSilicon: true,
    },
    modelDownload: { kind: "idle" as const },
  },
};

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: typeof mockState) => unknown) => selector(mockState),
}));

vi.mock("@store/slices/llamacppSlice", () => ({
  fetchLlamacppModels: () => mockFetchLlamacppModels(),
  fetchLlamacppSystemInfo: () => mockFetchLlamacppSystemInfo(),
  downloadLlamacppModel: (modelId: string) => mockDownloadLlamacppModel(modelId),
  cancelLlamacppModelDownload: () => mockCancelLlamacppModelDownload(),
}));

vi.mock("@shared/toast", () => ({
  addToastError: (error: unknown) => mockAddToastError(error),
}));

vi.mock("../OnboardingHeader", () => ({
  OnboardingHeader: () => <div data-testid="onboarding-header" />,
}));

describe("LocalModelSelectPage", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockDispatch.mockImplementation((action: unknown) => action);
    mockAddToastError.mockReset();
  });

  it("shows a toast when selecting a downloaded model fails", async () => {
    const onSelect = vi.fn().mockRejectedValue(new Error("Server start failed"));

    render(
      <LocalModelSelectPage
        totalSteps={4}
        activeStep={2}
        onSelect={onSelect}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("qwen-3.5-4b");
    });
    await waitFor(() => {
      expect(mockAddToastError).toHaveBeenCalledWith(expect.any(Error));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
    });
  });
});
