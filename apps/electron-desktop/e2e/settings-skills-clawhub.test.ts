import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  finishOnboarding,
  navigateToSkillsTab,
  switchToClawHubSkills,
  switchToInstalledSkills,
  getTestCredentials,
} from "./helpers";

const creds = getTestCredentials();

async function waitForClawHubCard(page: Page): Promise<Locator> {
  const grid = page.locator(".UiSkillsGrid");
  await grid.waitFor({ state: "visible", timeout: 30_000 });
  const firstCard = grid.locator(':scope > [role="button"][tabindex="0"]').first();
  await expect(firstCard).toBeVisible({ timeout: 30_000 });
  return firstCard;
}

async function findInstallableClawHubCard(page: Page): Promise<Locator> {
  const grid = page.locator(".UiSkillsGrid");
  await grid.waitFor({ state: "visible", timeout: 30_000 });
  const cards = grid.locator(':scope > [role="button"][tabindex="0"]');
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const installButton = card.getByRole("button", { name: "Install" });
    if (await installButton.isVisible().catch(() => false)) {
      return card;
    }
  }
  throw new Error("No installable ClawHub skill card found");
}

async function countInstalledCustomSkills(page: Page): Promise<number> {
  return page.getByRole("button", { name: "Skill options" }).count();
}

test.describe("Settings — ClawHub live skills", () => {
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

  test("complete onboarding and open Skills on default ClawHub view", async () => {
    test.setTimeout(120_000);
    await finishOnboarding(page, creds!);
    await navigateToSkillsTab(page);

    const skillsSource = page.locator('[role="tablist"][aria-label="Skills source"]');
    await expect(skillsSource.getByRole("tab", { name: "ClawHub", exact: true })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByText("Filter", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Search ClawHub skills…")).toBeVisible();
    await expect(page.getByText("Sort", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Hide suspicious")).toBeVisible();
    await waitForClawHubCard(page);
  });

  test("opens a live ClawHub package detail page from the grid", async () => {
    const card = await waitForClawHubCard(page);
    const title = (await card.getAttribute("aria-label"))?.trim() ?? "";

    await card.click();

    const backBtn = page.getByText("← Back to Skills");
    await expect(backBtn).toBeVisible({ timeout: 15_000 });
    if (title) {
      await expect(page.locator("h1").getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Install|Remove/ })).toBeVisible();
    await backBtn.click();
    await waitForClawHubCard(page);
  });

  test("installs from ClawHub, appears in Installed, then removes cleanly", async () => {
    test.setTimeout(180_000);

    await switchToInstalledSkills(page);
    await expect(page.getByPlaceholder("Search by skills…")).toBeVisible();
    expect(await countInstalledCustomSkills(page)).toBe(0);

    await switchToClawHubSkills(page);
    const card = await findInstallableClawHubCard(page);
    const cardLabel = await card.getAttribute("aria-label");
    const targetCard = cardLabel
      ? page.locator(".UiSkillsGrid").getByRole("button", { name: cardLabel, exact: true }).first()
      : card;

    await targetCard.getByRole("button", { name: "Install" }).click();
    await expect(targetCard.getByRole("button", { name: "Remove" })).toBeVisible({
      timeout: 60_000,
    });

    await switchToInstalledSkills(page);
    await expect
      .poll(async () => await countInstalledCustomSkills(page), {
        timeout: 30_000,
      })
      .toBe(1);

    await switchToClawHubSkills(page);
    await expect(targetCard.getByRole("button", { name: "Remove" })).toBeVisible({
      timeout: 15_000,
    });
    await targetCard.getByRole("button", { name: "Remove" }).click();
    await expect(targetCard.getByRole("button", { name: "Install" })).toBeVisible({
      timeout: 60_000,
    });

    await switchToInstalledSkills(page);
    await expect
      .poll(async () => await countInstalledCustomSkills(page), {
        timeout: 30_000,
      })
      .toBe(0);
  });
});
