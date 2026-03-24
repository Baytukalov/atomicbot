import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  getTestCredentials,
  startNewTask,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Terminal page", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("complete onboarding", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await expect(page.getByText("What can I help with?")).toBeVisible();
  });

  test("enable terminal sidebar toggle via settings", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();
    await page.waitForTimeout(1_000);

    const termToggle = page.locator('[aria-label="Show terminal in sidebar"]');
    const checkbox = termToggle.locator('input[type="checkbox"]');

    if (!(await checkbox.isChecked())) {
      // Click the label wrapper to toggle the custom checkbox
      await termToggle.click();
      await page.waitForTimeout(500);
    }
    expect(await checkbox.isChecked()).toBe(true);
  });

  test("terminal link appears in sidebar after enabling", async () => {
    test.setTimeout(15_000);
    // Navigate back to chat to see the sidebar
    await startNewTask(page);

    const terminalLink = page.locator('[aria-label="Terminal"]');
    await expect(terminalLink).toBeVisible({ timeout: 5_000 });
  });

  test("navigate to terminal page", async () => {
    test.setTimeout(60_000);

    // terminalCreate IPC can hang if the main process isn't fully settled
    // after onboarding config patches. Retry via page navigation if stuck.
    const tabs = page.locator('[role="tab"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.locator('[aria-label="Terminal"]').click();
      try {
        await tabs.first().waitFor({ state: "visible", timeout: 15_000 });
        break;
      } catch {
        // Stuck on "Loading..." — navigate away and retry.
        await startNewTask(page);
        await page.waitForTimeout(2_000);
      }
    }

    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First tab should say "Terminal 1"
    await expect(tabs.first()).toContainText("Terminal 1");
  });

  test("create new terminal tab", async () => {
    test.setTimeout(15_000);
    const newTabBtn = page.locator('[aria-label="New terminal"]');
    await newTabBtn.click();
    await page.waitForTimeout(1_000);

    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("switch between terminal tabs", async () => {
    test.setTimeout(15_000);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Click first tab
    await tabs.first().click();
    await page.waitForTimeout(500);
    expect(await tabs.first().getAttribute("aria-selected")).toBe("true");

    // Click second tab
    await tabs.nth(1).click();
    await page.waitForTimeout(500);
    expect(await tabs.nth(1).getAttribute("aria-selected")).toBe("true");
  });

  test("close terminal tab", async () => {
    test.setTimeout(15_000);
    const tabs = page.locator('[role="tab"]');
    const countBefore = await tabs.count();

    // Close the last tab using its close button
    const lastTab = tabs.last();
    const label = await lastTab.locator("span").first().textContent();
    const closeBtn = page.locator(`[aria-label="Close ${label}"]`);
    await closeBtn.click();
    await page.waitForTimeout(1_000);

    const countAfter = await tabs.count();
    expect(countAfter).toBe(countBefore - 1);
  });
});
