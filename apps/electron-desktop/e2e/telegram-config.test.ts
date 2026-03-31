import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  gatewayRpc,
  getConfig,
  getTestCredentials,
  getTelegramConfig,
} from "./helpers";

const creds = getTestCredentials();
const telegramCfg = getTelegramConfig();
const hasTelegramToken = Boolean(telegramCfg.botToken?.trim());

function getObj(val: unknown): Record<string, unknown> {
  return val && typeof val === "object" && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

test.describe("Telegram channel config (gateway RPC)", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(!creds, "No API key — create e2e/e2e.config.json (see e2e.config.example.json)");
  test.skip(!hasTelegramToken, "No Telegram bot token in e2e.config.json");

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

  // ── Set Telegram token via config.patch ───────────────────

  test("set Telegram token via config.patch", async () => {
    test.setTimeout(30_000);
    const snap = await getConfig(page);

    const patchResult = await gatewayRpc<{ ok: boolean }>(page, "config.patch", {
      baseHash: snap.hash,
      raw: JSON.stringify({
        channels: {
          telegram: {
            botToken: telegramCfg.botToken,
          },
        },
        plugins: {
          entries: {
            telegram: { enabled: true },
          },
        },
      }),
    });
    expect(patchResult.ok).toBe(true);

    // Allow gateway to restart after config change
    await page.waitForTimeout(5_000);
  });

  // ── channels.status configured ────────────────────────────

  test("channels.status shows telegram configured after setting token", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      channels: Record<string, { configured?: boolean }>;
    }>(page, "channels.status", { probe: false, timeoutMs: 5000 });

    const availableChannels = Object.keys(result.channels ?? {});
    console.log("[telegram-config] available channels:", availableChannels.join(", "));
    const telegram = result.channels?.telegram;
    expect(telegram).toBeTruthy();
    expect(telegram!.configured).toBe(true);
  });

  // ── channels.status probe with real token ─────────────────

  test("channels.status probe validates real token", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      channels: Record<
        string,
        {
          configured?: boolean;
          probe?: { ok?: boolean; bot?: { username?: string } };
        }
      >;
    }>(page, "channels.status", { probe: true, timeoutMs: 10000 });

    const telegram = result.channels?.telegram;
    expect(telegram).toBeTruthy();
    expect(telegram!.probe?.ok).toBe(true);
    expect(telegram!.probe?.bot?.username).toBeTruthy();
  });

  // ── channels.logout clears token ──────────────────────────

  test("channels.logout clears telegram token", async () => {
    test.setTimeout(30_000);
    const result = await gatewayRpc<{
      cleared?: boolean;
      channel?: string;
    }>(page, "channels.logout", { channel: "telegram" });

    expect(result.channel).toBe("telegram");
    expect(result.cleared).toBe(true);

    // Allow gateway to process the logout
    await page.waitForTimeout(3_000);

    // Verify the token was actually removed from config
    const snap = await getConfig(page);
    const cfg = getObj(snap.config);
    const channels = getObj(cfg.channels);
    const telegram = getObj(channels.telegram);
    // Token should be empty/absent after logout
    const tokenValue = telegram.botToken;
    expect(!tokenValue || tokenValue === "").toBe(true);
  });
});
