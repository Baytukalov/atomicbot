import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  sendChatMessage,
  gatewayRpc,
  getConfig,
  getTestCredentials,
  startNewTask,
  waitForAssistantResponse,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Exec Approval flow (gateway exec pipeline)", () => {
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
  });

  test("set exec host=gateway and ask=always via config.patch", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);
    await gatewayRpc(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({
        tools: { exec: { host: "gateway", ask: "always" } },
      }),
    });
    // Gateway restarts after config.patch; wait for it to come back
    await page.waitForTimeout(8_000);
  });

  test("start new session so config change is picked up", async () => {
    test.setTimeout(15_000);
    await startNewTask(page);
    await page.waitForTimeout(2_000);
  });

  // ── Exec approval modal ───────────────────────────────────

  test("send exec command and approval modal appears", async () => {
    test.setTimeout(180_000);

    await sendChatMessage(
      page,
      "Run this shell command and show me the output: echo HELLO_E2E_TEST"
    );

    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await modal.waitFor({ state: "visible", timeout: 120_000 });
  });

  test("approval modal shows the command", async () => {
    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await expect(modal).toBeVisible();
    const modalText = await modal.textContent();
    expect(modalText).toContain("echo HELLO_E2E_TEST");
  });

  test("approval modal has all three action buttons", async () => {
    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await expect(modal.getByRole("button", { name: "Allow once" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Always allow" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Deny" })).toBeVisible();
  });

  test("allow once -> tool call result appears in chat", async () => {
    test.setTimeout(180_000);

    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await modal.getByRole("button", { name: "Allow once" }).click();

    // Modal should disappear after resolving
    await modal.waitFor({ state: "hidden", timeout: 10_000 });

    // Wait for the assistant's response that contains the exec output.
    await waitForAssistantResponse(page, 120_000);
    await page.waitForTimeout(2_000);

    // The assistant response should include the output of `echo HELLO_E2E_TEST`
    const bubbles = page.locator(".UiChatText.UiMarkdown");
    const count = await bubbles.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const allText = await bubbles.allTextContents();
    const combined = allText.join(" ");
    expect(combined).toContain("HELLO_E2E_TEST");
  });

  test("system 'continue' message is filtered from chat", async () => {
    // After exec approval, the UI auto-sends "continue" to the agent.
    // This message should be filtered by isApprovalContinueMessage and
    // not appear as a visible user bubble in the chat.
    const userBubbles = page.locator(".UiChatText");
    const allTexts = await userBubbles.allTextContents();

    // No standalone "continue" user message should be visible
    const continueMessages = allTexts.filter((t) => t.trim().toLowerCase() === "continue");
    expect(continueMessages.length).toBe(0);
  });
});
