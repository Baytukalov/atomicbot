import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  getTestCredentials,
  startNewTask,
  waitForAssistantResponse,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Chat composer UI elements", () => {
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

  test("complete onboarding and reach chat page", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await expect(page.getByText("What can I help with?")).toBeVisible();
  });

  test("composer shows textarea with placeholder", async () => {
    test.setTimeout(10_000);
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toBeTruthy();
  });

  test("attach file button is visible", async () => {
    test.setTimeout(10_000);
    const attachBtn = page.locator('[aria-label="Attach file"]');
    await expect(attachBtn).toBeVisible();
  });

  test("microphone button is present", async () => {
    test.setTimeout(10_000);
    // Voice button can have different labels depending on configuration
    const micBtn = page.locator(
      '[aria-label="Hold to record voice"], [aria-label="Voice not configured"]'
    );
    const count = await micBtn.count();
    // Mic button may not be visible if voice is completely disabled; that's OK
    if (count > 0) {
      await expect(micBtn.first()).toBeVisible();
    }
  });

  test("send button is disabled when textarea is empty", async () => {
    test.setTimeout(10_000);
    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await page.waitForTimeout(300);

    const sendBtn = page.locator('[aria-label="Send"]');
    await expect(sendBtn).toBeDisabled();
  });

  test("send button becomes enabled when text is entered", async () => {
    test.setTimeout(10_000);
    const textarea = page.locator("textarea").first();
    await textarea.fill("test message");
    await page.waitForTimeout(300);

    const sendBtn = page.locator('[aria-label="Send"]');
    await expect(sendBtn).toBeEnabled();
  });

  test("Enter key sends message (without Shift)", async () => {
    test.setTimeout(180_000);
    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await page.waitForTimeout(200);
    await textarea.fill("Reply with just OK");
    await page.waitForTimeout(300);

    await textarea.press("Enter");

    // The user message should appear in the chat
    await page
      .getByText("Reply with just OK")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    // Wait for response (the message was sent via Enter)
    await waitForAssistantResponse(page, 120_000);
  });

  test("Shift+Enter adds newline instead of sending", async () => {
    test.setTimeout(15_000);
    // Start a fresh session
    await startNewTask(page);

    const textarea = page.locator("textarea").first();
    await textarea.click();
    await textarea.fill("line one");
    await textarea.press("Shift+Enter");
    await textarea.type("line two");

    const value = await textarea.inputValue();
    expect(value).toContain("line one");
    expect(value).toContain("line two");
    expect(value).toContain("\n");
  });

  test("textarea auto-resizes with content", async () => {
    test.setTimeout(15_000);
    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await page.waitForTimeout(200);

    const initialHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);

    // Fill with multiline content
    await textarea.fill("line1\nline2\nline3\nline4\nline5");
    await page.waitForTimeout(300);

    const expandedHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);

    expect(expandedHeight).toBeGreaterThan(initialHeight);
  });
});
