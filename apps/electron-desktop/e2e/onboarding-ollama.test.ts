import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsent,
  waitForProviderSelect,
  selectProvider,
  waitForModelSelect,
  selectFirstModel,
  skipSkills,
  waitForConnectionsPage,
  skipConnections,
} from "./helpers";

/**
 * Checks whether a local Ollama instance is reachable.
 * All onboarding-ollama tests require this since they exercise
 * the full flow which contacts the Ollama API for model listing.
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

test.describe("Onboarding — Ollama provider flow", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;
  let ollamaAvailable: boolean;

  test.beforeAll(async () => {
    ollamaAvailable = await isOllamaReachable();
  });

  test.skip(() => !ollamaAvailable, "Local Ollama not running — skipping Ollama onboarding e2e");

  test.beforeAll(async () => {
    if (!ollamaAvailable) return;
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  // ── Consent → Provider select ────────────────────────────

  test("consent screen to provider select", async () => {
    test.setTimeout(90_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
  });

  // ── Select Ollama → custom setup page ────────────────────

  test("selecting Ollama navigates to Ollama setup page", async () => {
    test.setTimeout(30_000);

    await selectProvider(page, "ollama");

    const ollamaSetup = page.locator('[aria-label="Ollama setup"]');
    await expect(ollamaSetup).toBeVisible({ timeout: 15_000 });
  });

  test("Ollama setup page shows mode toggle", async () => {
    test.setTimeout(10_000);

    const modeToggle = page.locator('[aria-label="Ollama mode"]');
    await expect(modeToggle).toBeVisible();
    await expect(modeToggle.getByText("Local")).toBeVisible();
    await expect(modeToggle.getByText("Cloud + Local")).toBeVisible();
  });

  test("Ollama setup page shows base URL and Continue button", async () => {
    test.setTimeout(10_000);

    await expect(page.getByText("Configure Ollama")).toBeVisible();
    const urlInput = page.locator('input[placeholder="http://127.0.0.1:11434"]');
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue("http://127.0.0.1:11434");
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("Test Connection succeeds with local Ollama", async () => {
    test.setTimeout(20_000);

    await page.getByText("Test Connection").click();
    await expect(page.getByText("Connected to Ollama")).toBeVisible({ timeout: 15_000 });
  });

  // ── Continue through the rest of onboarding ──────────────

  test("continue from Ollama setup to model select", async () => {
    test.setTimeout(60_000);

    const continueBtn = page.getByRole("button", { name: "Continue" });
    await continueBtn.click();

    await waitForModelSelect(page);
    await expect(page.getByText("Select AI Model")).toBeVisible();

    await expect(
      page.locator('[aria-label="Model selection"]').getByRole("button", { name: "Continue" })
    ).toBeEnabled();
  });

  test("select model and proceed to skills page", async () => {
    test.setTimeout(60_000);
    const modelId = await selectFirstModel(page);
    expect(modelId).toBeTruthy();
  });

  test("skip skills and connections to finish onboarding", async () => {
    test.setTimeout(30_000);
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await skipConnections(page);

    await page.waitForTimeout(700);
    const onboarded = await page.evaluate(() =>
      localStorage.getItem("openclaw.desktop.onboarded.v1")
    );
    expect(onboarded).toBe("1");
  });
});
