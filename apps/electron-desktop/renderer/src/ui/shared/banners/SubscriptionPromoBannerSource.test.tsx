// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { SubscriptionPromoBannerSource } from "./SubscriptionPromoBannerSource";
import { BannerProvider, useBanners } from "./BannerContext";
import { BannerCarousel } from "./BannerCarousel";

const mockAuthState = {
  mode: "self-managed" as string | null,
};

const mockDispatch = vi.fn();
const mockNavigate = vi.fn();
const mockRequest = vi.fn();
const mockSwitchMode = vi.fn();

vi.mock("@store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (st: unknown) => unknown) => selector({ auth: mockAuthState }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockGatewayRpc = { request: mockRequest };
vi.mock("@gateway/context", () => ({
  useGatewayRpc: () => mockGatewayRpc,
}));

vi.mock("@store/slices/auth/mode-switch", () => ({
  switchMode: (payload: unknown) => mockSwitchMode(payload),
}));

vi.mock("@shared/toast", () => ({
  addToastError: vi.fn(),
}));

vi.mock("../../app/routes", () => ({
  routes: { settings: "/settings" },
}));

function TestHarness() {
  return (
    <BannerProvider>
      <SubscriptionPromoBannerSource />
      <BannerDisplay />
    </BannerProvider>
  );
}

function BannerDisplay() {
  const banners = useBanners();
  return <BannerCarousel items={banners} />;
}

describe("SubscriptionPromoBannerSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockAuthState.mode = "self-managed";
    mockDispatch.mockReset();
    mockNavigate.mockReset();
    mockSwitchMode.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not show banner before 5-second delay", () => {
    const { container } = render(<TestHarness />);
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("does not show banner when temporarily disabled", () => {
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });

  it("does not show banner when mode is paid", () => {
    mockAuthState.mode = "paid";
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });

  it("does not show banner when mode is local-model", () => {
    mockAuthState.mode = "local-model";
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });

  it("does not show banner when mode is null (temporarily disabled)", () => {
    mockAuthState.mode = null;
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });

  it("does not show banner if previously dismissed persistently", () => {
    localStorage.setItem("banner-dismissed", JSON.stringify(["subscription-promo"]));
    render(<TestHarness />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("100+ AI Models. One Subscription.")).toBeNull();
  });
});
