import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsent,
  waitForProviderSelect,
  selectProvider,
  enterApiKey,
  waitForModelSelect,
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  skipConnections,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Full onboarding flow", () => {
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

  test("consent screen -> welcome auto-start -> provider select", async () => {
    test.setTimeout(90_000);
    await acceptConsent(page);
    await waitForProviderSelect(page);
    await expect(page.getByText("Choose AI Provider")).toBeVisible();
  });

  test("select provider and navigate to API key page", async () => {
    await selectProvider(page, creds!.provider);
    await expect(page.locator('[aria-label="API key setup"]')).toBeVisible({ timeout: 15_000 });
  });

  test("enter API key and navigate to model select", async () => {
    test.setTimeout(120_000);
    await enterApiKey(page, creds!.key);
    await waitForModelSelect(page);
    await expect(page.getByText("Select AI Model")).toBeVisible();
    await expect(
      page.locator('[aria-label="Model selection"]').getByRole("button", { name: "Continue" })
    ).toBeEnabled();
  });

  test("select model and navigate to skills page", async () => {
    const modelId = await selectFirstModel(page);
    expect(modelId).toBeTruthy();
    await waitForSkillsPage(page);
    await expect(page.getByText("Set Up Skills")).toBeVisible();
  });

  test("skip skills and navigate to connections page", async () => {
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("skip connections and finish onboarding -> chat", async () => {
    await skipConnections(page);

    const onboarded = await page.evaluate(() =>
      localStorage.getItem("openclaw.desktop.onboarded.v1")
    );
    expect(onboarded).toBe("1");
  });
});
