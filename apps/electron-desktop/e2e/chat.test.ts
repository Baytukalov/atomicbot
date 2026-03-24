import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  sendChatMessage,
  startNewTask,
  waitForAssistantResponse,
  getSessionsList,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Chat functionality", () => {
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

  test("finish onboarding and see start chat page", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);

    await expect(page.getByText("What can I help with?")).toBeVisible();
    await expect(page.getByText("Send a message to start a conversation")).toBeVisible();

    const onboarded = await page.evaluate(() =>
      localStorage.getItem("openclaw.desktop.onboarded.v1")
    );
    expect(onboarded).toBe("1");
  });

  test("send a message and receive assistant response", async () => {
    test.setTimeout(180_000);
    await sendChatMessage(page, "What is 2 + 2? Reply with just the number.");

    await page.getByText("What is 2 + 2?").first().waitFor({ state: "visible", timeout: 10_000 });

    const response = await waitForAssistantResponse(page, 120_000);
    expect(response).toContain("4");
  });

  test("session appears in sidebar after sending message", async () => {
    test.setTimeout(30_000);
    const sessionItem = page.locator('[aria-label="Chat sessions"] ul[role="list"] li').first();
    await sessionItem.waitFor({ state: "visible", timeout: 15_000 });

    const sessions = await getSessionsList(page);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  test("new session button resets to start chat page", async () => {
    test.setTimeout(30_000);
    await startNewTask(page);

    await expect(page.locator("textarea").first()).toHaveValue("");
  });
});
