import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSettings,
  sendChatMessage,
  gatewayRpc,
  getConfig,
  getTestCredentials,
  startNewTask,
  waitForAssistantResponse,
} from "./helpers";

const creds = getTestCredentials();

test.describe("Exec approval modes: balanced vs permissive", () => {
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

  // ── Toggle test ──────────────────────────────────────────────

  test("navigate to Other tab and see Command approval toggle", async () => {
    test.setTimeout(30_000);
    await navigateToSettings(page);

    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();
    await page.waitForTimeout(1_000);

    await expect(page.getByText("Command approval")).toBeVisible({ timeout: 10_000 });
    const select = page.locator("select").filter({ has: page.locator('option[value="balanced"]') });
    await expect(select).toBeVisible();
  });

  test("toggle to permissive and verify config syncs", async () => {
    test.setTimeout(30_000);

    const select = page.locator("select").filter({ has: page.locator('option[value="balanced"]') });
    await select.selectOption("permissive");
    await page.waitForTimeout(3_000);

    // Verify exec-approvals.json was updated
    const approvals = await gatewayRpc<{
      file: { defaults?: { security?: string; ask?: string } };
    }>(page, "exec.approvals.get", {});
    expect(approvals.file.defaults?.security).toBe("full");
    expect(approvals.file.defaults?.ask).toBe("off");

    // Verify main config was also synced
    const snap = await getConfig(page);
    const config = (snap.config ?? {}) as Record<string, unknown>;
    const tools = (config.tools ?? {}) as Record<string, unknown>;
    const exec = (tools.exec ?? {}) as Record<string, unknown>;
    expect(exec.security).toBe("full");
    expect(exec.ask).toBe("off");
  });

  test("toggle back to balanced and verify config syncs", async () => {
    test.setTimeout(30_000);

    const select = page.locator("select").filter({ has: page.locator('option[value="balanced"]') });
    await select.selectOption("balanced");
    await page.waitForTimeout(3_000);

    const approvals = await gatewayRpc<{
      file: { defaults?: { security?: string; ask?: string } };
    }>(page, "exec.approvals.get", {});
    expect(approvals.file.defaults?.security).toBe("allowlist");
    expect(approvals.file.defaults?.ask).toBe("on-miss");

    const snap = await getConfig(page);
    const config = (snap.config ?? {}) as Record<string, unknown>;
    const tools = (config.tools ?? {}) as Record<string, unknown>;
    const exec = (tools.exec ?? {}) as Record<string, unknown>;
    expect(exec.security).toBe("allowlist");
    expect(exec.ask).toBe("on-miss");
  });

  // ── Permissive mode: no approval modal ──────────────────────

  test("set permissive mode and force gateway host", async () => {
    test.setTimeout(30_000);

    // Set permissive via the toggle
    const select = page.locator("select").filter({ has: page.locator('option[value="balanced"]') });
    await select.selectOption("permissive");
    await page.waitForTimeout(2_000);

    // Also ensure exec host is gateway
    const snap = await getConfig(page);
    await gatewayRpc(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({ tools: { exec: { host: "gateway" } } }),
    });

    // Gateway restarts after config.patch; wait for reconnect
    await page.waitForTimeout(8_000);
  });

  test("start new session for permissive test", async () => {
    test.setTimeout(15_000);
    await startNewTask(page);
    await page.waitForTimeout(2_000);
  });

  test("permissive: exec command runs without approval modal", async () => {
    test.setTimeout(180_000);

    await sendChatMessage(
      page,
      "Run this shell command and show me the output: echo PERMISSIVE_OK"
    );

    // In permissive mode, no approval modal should appear.
    // The assistant should produce the output directly.
    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');

    // Wait for the assistant to finish responding
    await waitForAssistantResponse(page, 120_000);
    await page.waitForTimeout(2_000);

    // Verify modal never appeared (should be hidden/not present)
    const modalWasVisible = await modal.isVisible().catch(() => false);
    expect(modalWasVisible).toBe(false);

    // The output should contain our marker
    const bubbles = page.locator(".UiChatText.UiMarkdown");
    const allText = await bubbles.allTextContents();
    const combined = allText.join(" ");
    expect(combined).toContain("PERMISSIVE_OK");
  });

  // ── Balanced mode: approval modal appears ───────────────────

  test("switch to balanced mode with ask=always", async () => {
    test.setTimeout(30_000);

    // Navigate to settings and switch to balanced
    await navigateToSettings(page);
    const tabNav = page.locator('[aria-label="Settings sections"]');
    await tabNav.getByText("Other").click();
    await page.waitForTimeout(1_000);

    const select = page.locator("select").filter({ has: page.locator('option[value="balanced"]') });
    await select.selectOption("balanced");
    await page.waitForTimeout(2_000);

    // Set ask=always so the modal appears even for simple commands
    const snap = await getConfig(page);
    await gatewayRpc(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({ tools: { exec: { host: "gateway", ask: "always" } } }),
    });

    await page.waitForTimeout(8_000);
  });

  test("start new session for balanced test", async () => {
    test.setTimeout(15_000);
    await startNewTask(page);
    await page.waitForTimeout(2_000);
  });

  test("balanced: exec command triggers approval modal", async () => {
    test.setTimeout(180_000);

    await sendChatMessage(
      page,
      "Run this shell command and show me the output: echo BALANCED_APPROVAL"
    );

    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await modal.waitFor({ state: "visible", timeout: 120_000 });

    const modalText = await modal.textContent();
    expect(modalText).toContain("echo BALANCED_APPROVAL");
  });

  test("balanced: approval modal has action buttons", async () => {
    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await expect(modal.getByRole("button", { name: "Allow once" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Always allow" })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Deny" })).toBeVisible();
  });

  test("balanced: allow once resolves and command output appears", async () => {
    test.setTimeout(180_000);

    const modal = page.locator('[role="dialog"][aria-label="Exec approval needed"]');
    await modal.getByRole("button", { name: "Allow once" }).click();

    await modal.waitFor({ state: "hidden", timeout: 10_000 });

    await waitForAssistantResponse(page, 120_000);
    await page.waitForTimeout(2_000);

    const bubbles = page.locator(".UiChatText.UiMarkdown");
    const allText = await bubbles.allTextContents();
    const combined = allText.join(" ");
    expect(combined).toContain("BALANCED_APPROVAL");
  });
});
