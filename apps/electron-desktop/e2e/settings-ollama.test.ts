import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  getConfig,
  getTestCredentials,
} from "./helpers";

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

const creds = getTestCredentials();

/**
 * Checks whether a local Ollama instance is reachable.
 * Used to conditionally run connection-test assertions.
 */
async function isOllamaReachable(baseUrl = "http://127.0.0.1:11434"): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

test.describe("Settings — Ollama provider configuration", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  let ollamaAvailable: boolean;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ollamaAvailable = await isOllamaReachable();
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  // ── Onboarding (prerequisite) ────────────────────────────

  test("complete onboarding with default provider", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Navigate to Settings → AI Models ─────────────────────

  test("navigate to AI Models tab", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);
  });

  // ── Switch provider to Ollama ────────────────────────────

  test("switch provider dropdown to Ollama", async () => {
    test.setTimeout(15_000);

    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger.click();
    await page.waitForTimeout(500);

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    await listbox.getByText("Ollama").first().click();
    await page.waitForTimeout(1_000);
  });

  // ── Verify Ollama configuration UI ───────────────────────

  test("shows inline Ollama section with mode toggle", async () => {
    test.setTimeout(15_000);

    await expect(page.getByText("Use your local or cloud AI models with Ollama")).toBeVisible({
      timeout: 10_000,
    });

    const modeToggle = page.locator('[aria-label="Ollama mode"]');
    await expect(modeToggle).toBeVisible();
    await expect(modeToggle.getByRole("button", { name: "Local", exact: true })).toBeVisible();
    await expect(
      modeToggle.getByRole("button", { name: "Cloud + Local", exact: true })
    ).toBeVisible();
  });

  test("shows base URL input with default value", async () => {
    test.setTimeout(10_000);

    const urlInput = page.locator('input[placeholder="http://127.0.0.1:11434"]');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue("http://127.0.0.1:11434");
  });

  test("does NOT show API key input in Local mode", async () => {
    test.setTimeout(10_000);

    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(0);
  });

  test("shows Test Connection and Save buttons", async () => {
    test.setTimeout(10_000);

    await expect(page.getByRole("button", { name: "Test Connection" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  // ── Cloud mode ───────────────────────────────────────────

  test("switching to Cloud mode shows API key input", async () => {
    test.setTimeout(10_000);

    await page
      .locator('[aria-label="Ollama mode"]')
      .getByRole("button", { name: "Cloud + Local", exact: true })
      .click();
    await page.waitForTimeout(500);

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveCount(1);
  });

  test("switching back to Local mode hides API key input", async () => {
    test.setTimeout(10_000);

    await page
      .locator('[aria-label="Ollama mode"]')
      .getByRole("button", { name: "Local", exact: true })
      .click();
    await page.waitForTimeout(500);

    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(0);
  });

  // ── Connection test (only if local Ollama is running) ────

  test("Test Connection shows success when Ollama is reachable", async () => {
    test.skip(!ollamaAvailable, "Local Ollama not running — skipping connection test");
    test.setTimeout(20_000);

    await page.getByRole("button", { name: "Test Connection" }).click();

    await expect(page.getByText("Connected to Ollama")).toBeVisible({ timeout: 15_000 });
  });

  // ── Save in Local mode ───────────────────────────────────

  test("save Ollama in Local mode and verify config", async () => {
    test.setTimeout(30_000);

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(3_000);

    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const models = getObj(cfg.models);
    const providers = getObj(models.providers);
    const ollamaProvider = getObj(providers.ollama);
    const auth = getObj(cfg.auth);
    const profiles = getObj(auth.profiles);
    const ollamaProfile = getObj(profiles["ollama:default"]);
    const order = getObj(auth.order);
    const ollamaOrder = order.ollama;

    expect(ollamaProvider.baseUrl).toBe("http://127.0.0.1:11434");
    expect(ollamaProvider.api).toBe("ollama");
    expect(ollamaProfile).toBeTruthy();
    expect(ollamaProfile.provider).toBe("ollama");
    expect(ollamaProfile.mode).toBe("api_key");
    expect(Array.isArray(ollamaOrder)).toBe(true);
    expect(ollamaOrder).toContain("ollama:default");
  });
});
