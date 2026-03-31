import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  gatewayRpc,
  getConfig,
  getTestCredentials,
  getSecondProviderCredentials,
} from "./helpers";

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (API Key)",
  openrouter: "OpenRouter",
  google: "Google (Gemini)",
  nvidia: "NVIDIA NIM",
  xai: "xAI (Grok)",
  zai: "Z.ai (GLM)",
  minimax: "MiniMax",
  moonshot: "Moonshot (Kimi)",
  "kimi-coding": "Kimi Coding",
};

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

const creds = getTestCredentials();
const secondCreds = getSecondProviderCredentials();

test.describe("Settings AI Models tab (self-managed mode)", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  let originalModelPrimary: string;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  // ── Onboarding ────────────────────────────────────────────

  test("complete self-managed onboarding", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
  });

  // ── Navigate to settings ──────────────────────────────────

  test("navigate to settings and see AI Models tab", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await expect(tabNav.getByText("AI Models")).toBeVisible();
    await tabNav.getByText("AI Models").click();
    await page.waitForTimeout(1_000);
  });

  // ── Connection toggle ─────────────────────────────────────

  test("connection toggle shows API keys as active", async () => {
    test.setTimeout(15_000);
    const toggle = page.locator('[aria-label="Connection mode"]');
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    const ownKeyBtn = toggle.getByText("API keys");
    await expect(ownKeyBtn).toBeVisible();
  });

  // ── Provider dropdown ─────────────────────────────────────

  test("provider dropdown shows the onboarding provider", async () => {
    test.setTimeout(15_000);
    const displayName = PROVIDER_DISPLAY_NAMES[creds!.provider] ?? creds!.provider;

    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await expect(providerTrigger).toBeVisible({ timeout: 10_000 });
    await expect(providerTrigger).toContainText(displayName);
  });

  // ── Model dropdown ────────────────────────────────────────

  test("model dropdown shows a selected model (not placeholder)", async () => {
    test.setTimeout(15_000);
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await expect(modelTrigger).toBeVisible({ timeout: 10_000 });
    await expect(modelTrigger).not.toContainText("Select model");
    await expect(modelTrigger).not.toContainText("Select provider first");

    // Record current model for later restore
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    originalModelPrimary = model.primary as string;
    expect(originalModelPrimary).toBeTruthy();
  });

  // ── Auto-select model on provider switch ──────────────────

  test("switching provider auto-selects first model from new provider", async () => {
    test.skip(
      !secondCreds,
      "No second provider key — configure 2+ provider keys in e2e.config.json"
    );
    test.setTimeout(60_000);

    const displayName = PROVIDER_DISPLAY_NAMES[secondCreds!.provider] ?? secondCreds!.provider;

    // First, add the second provider's API key so it has models
    const providerTrigger = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger.click();
    await page.waitForTimeout(500);

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    await listbox.getByText(displayName).click();
    await page.waitForTimeout(1_000);

    // Fill the API key
    const keyInput = page.locator('input[type="password"]');
    await keyInput.waitFor({ state: "visible", timeout: 10_000 });
    await keyInput.fill(secondCreds!.key);
    await page.waitForTimeout(500);

    const saveBtn = page.getByRole("button", { name: /Continue|Save|Connect/ }).last();
    await saveBtn.click();
    await page.waitForTimeout(5_000);

    // Now switch to the second provider again (it may have reloaded)
    const providerTrigger2 = page.locator('button[aria-haspopup="listbox"]').first();
    await providerTrigger2.click();
    await page.waitForTimeout(500);

    const listbox2 = page.locator('[role="listbox"]');
    await expect(listbox2).toBeVisible({ timeout: 5_000 });
    await listbox2.getByText(displayName).click();
    await page.waitForTimeout(3_000);

    // Verify model dropdown shows a model name (auto-selected), not a placeholder
    const modelTrigger = page.locator('button[aria-haspopup="listbox"]').last();
    await expect(modelTrigger).not.toContainText("Select model", { timeout: 10_000 });
    await expect(modelTrigger).not.toContainText("No models available");

    // Verify via RPC that config reflects the auto-selected model from the second provider
    await page.waitForTimeout(2_000);
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    const newPrimary = model.primary as string;
    expect(newPrimary).toBeTruthy();
    expect(newPrimary.startsWith(`${secondCreds!.provider}/`)).toBe(true);
  });

  // ── Restore original model ────────────────────────────────

  test("restore original model via config.patch", async () => {
    test.skip(
      !secondCreds,
      "No second provider key — skipped auto-select test, nothing to restore"
    );
    test.setTimeout(30_000);

    const snap = await getConfig(page);
    await gatewayRpc(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({
        agents: { defaults: { model: { primary: originalModelPrimary } } },
      }),
    });
    await page.waitForTimeout(2_000);

    const after = await getConfig(page);
    const cfg = getObj(after.config);
    const agents = getObj(cfg.agents);
    const defaults = getObj(agents.defaults);
    const model = getObj(defaults.model);
    expect(model.primary).toBe(originalModelPrimary);
  });
});
