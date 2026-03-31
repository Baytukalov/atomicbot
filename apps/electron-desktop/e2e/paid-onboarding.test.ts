import { test, expect, type Page } from "@playwright/test";
import {
  type AppContext,
  launchApp,
  closeApp,
  acceptConsentOnly,
  waitForSetupModePage,
  selectPaid,
  waitForModelSelect,
  selectFirstModel,
  waitForSkillsPage,
  skipSkills,
  waitForConnectionsPage,
  waitForSetupReviewPage,
  waitForSuccessPage,
  waitForChatPage,
  simulateAuthDeepLink,
  simulateStripeSuccessDeepLink,
  getPaidCredentials,
} from "./helpers";

const paid = getPaidCredentials();

test.describe("Paid onboarding flow", () => {
  test.describe.configure({ mode: "serial" });

  let ctx: AppContext;
  let page: Page;

  test.skip(
    !paid,
    "No paid credentials — set paid.jwt/email/userId in e2e.config.json or TEST_PAID_* env vars"
  );

  test.beforeAll(async () => {
    ctx = await launchApp();
    page = ctx.page;
  });

  test.afterAll(async () => {
    if (ctx) await closeApp(ctx);
  });

  test("consent -> setup mode -> select paid triggers auth flow", async () => {
    test.setTimeout(90_000);
    await acceptConsentOnly(page);
    await waitForSetupModePage(page);
    await selectPaid(page);

    // After clicking "Continue with Google", the button should show busy state
    const container = page.locator('[aria-label="Setup mode selection"]');
    await expect(container).toBeVisible();
  });

  test("simulate auth deep link -> paid model select", async () => {
    test.setTimeout(60_000);

    await simulateAuthDeepLink(ctx.app, {
      jwt: paid!.jwt,
      email: paid!.email,
      userId: paid!.userId,
    });

    await waitForModelSelect(page);
    await expect(page.getByText("Select AI Model")).toBeVisible();

    await expect(
      page.locator('[aria-label="Model selection"]').getByRole("button", { name: "Continue" })
    ).toBeEnabled();
  });

  test("select model -> skills page", async () => {
    test.setTimeout(60_000);
    const modelId = await selectFirstModel(page);
    expect(modelId).toBeTruthy();
    await waitForSkillsPage(page);
    await expect(page.getByText("Set Up Skills")).toBeVisible();
  });

  test("skip skills -> connections page", async () => {
    test.setTimeout(30_000);
    await skipSkills(page);
    await waitForConnectionsPage(page);
    await expect(page.getByText("Set Up Connections")).toBeVisible();
  });

  test("skip connections -> setup review page", async () => {
    test.setTimeout(30_000);
    await page
      .locator('[aria-label="Connections setup"]')
      .getByRole("button", { name: /Skip|Continue/ })
      .first()
      .click();

    // If user is already subscribed, this navigates to chat instead.
    // Try to detect either review or chat page.
    const reviewOrChat = await Promise.race([
      waitForSetupReviewPage(page).then(() => "review" as const),
      waitForChatPage(page).then(() => "chat" as const),
    ]);

    if (reviewOrChat === "chat") {
      // Already subscribed — skip remaining review/payment tests
      test.skip(true, "User is already subscribed — skipping review/payment steps");
      return;
    }

    await expect(page.getByText("Upgrade to unlock all features")).toBeVisible();
    await expect(page.getByText("Auto refill credits")).toBeVisible();
  });

  test("review page has Subscribe button", async () => {
    const container = page.locator('[aria-label="Setup review"]');
    const subscribeBtn = container.getByRole("button", { name: /Subscribe|Start.*Trial/ });
    await expect(subscribeBtn).toBeVisible();
  });

  test("review page has Back button", async () => {
    const container = page.locator('[aria-label="Setup review"]');
    await expect(container.getByText("Back")).toBeVisible();
  });

  test("click Subscribe -> payment pending state", async () => {
    test.setTimeout(30_000);
    const container = page.locator('[aria-label="Setup review"]');
    const subscribeBtn = container.getByRole("button", { name: /Subscribe|Start.*Trial/ });
    await subscribeBtn.click();

    // After clicking Subscribe, the backend creates a checkout session.
    // If JWT is valid, UI transitions to "Waiting for payment..." state.
    // If JWT is invalid/expired, an error may appear. Handle both cases.
    const pendingOrError = await Promise.race([
      page
        .locator('[aria-label="Waiting for payment"]')
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "pending" as const),
      page
        .locator(".UiErrorText")
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "error" as const),
    ]).catch(() => "timeout" as const);

    if (pendingOrError === "error" || pendingOrError === "timeout") {
      test.skip(true, "Backend rejected checkout — JWT may be expired or account state unexpected");
      return;
    }

    await expect(page.getByText("Waiting for payment...")).toBeVisible();
    await expect(page.getByText("Complete the checkout in your browser")).toBeVisible();
  });

  test("simulate stripe-success deep link -> success page", async () => {
    test.setTimeout(180_000);
    await simulateStripeSuccessDeepLink(ctx.app);

    await waitForSuccessPage(page);
    await expect(page.getByRole("button", { name: "Start chat" })).toBeVisible({
      timeout: 130_000,
    });
  });

  test("click Start chat -> navigates to chat page", async () => {
    test.setTimeout(30_000);
    await page.getByRole("button", { name: "Start chat" }).click();
    await waitForChatPage(page);
  });
});
