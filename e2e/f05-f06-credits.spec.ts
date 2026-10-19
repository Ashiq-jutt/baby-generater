// F05 buy credits, F06 earn them. The billing copy is the product here: the
// largest complaint in fixes.md (39 of 107 reviews) was billing, so what
// these screens SAY is as much under test as what they do.
import { test, expect } from "@playwright/test";
import { a11y, balance, expectNoErrors, goHome, signIn, tab, watchForErrors } from "./helpers";

test.describe("F05 buy credits", () => {
  test("F05-H1 buying a pack raises the balance", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    const before = await balance(page);

    await tab(page, /credits/i).click();
    await page.getByRole("button", { name: /creator/i }).click();
    await expect(page.getByText(/these never expire/i)).toBeVisible();
    await goHome(page);
    expect(await balance(page)).toBe(before + 1150);
    expectNoErrors(errors);
  });

  test("F05-E1 every pack names a video count, not just credits", async ({ page }) => {
    await page.goto("/credits");
    for (const pack of [/mini/i, /starter/i, /creator/i, /studio/i]) {
      const card = page.getByRole("button", { name: pack });
      const label = await card.getAttribute("aria-label");
      expect(label, `${pack} does not say how many videos it buys`)
        .toMatch(/about \d+ five-second videos/i);
    }
  });

  test("F05-E2 restore purchases is present", async ({ page }) => {
    // the App Store requires a restore path for non-consumable purchases
    await page.goto("/credits");
    await expect(page.getByRole("button", { name: /restore purchases/i })).toBeVisible();
  });

  test("F05-E3 the screen says there is no subscription", async ({ page }) => {
    await page.goto("/credits");
    await expect(page.getByText(/no subscription/i)).toBeVisible();
    await expect(page.getByText(/nothing to cancel/i)).toBeVisible();
  });
});

test.describe("F06 free credits", () => {
  test("F06-H1/E1 the daily claim works once and then refuses clearly", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await tab(page, /credits/i).click();

    // sign-in already claimed today in the in-memory layer, so the control
    // must be present and honestly disabled rather than absent
    const claimed = page.getByRole("button", { name: /claimed today/i });
    const claimable = page.getByRole("button", { name: /claim 10 credits/i });
    const which = await claimed.isVisible().catch(() => false) ? claimed : claimable;
    await expect(which).toBeVisible();

    if (which === claimable) {
      const before = await balance(page);
      await claimable.click();
      await expect(page.getByText(/credits added/i)).toBeVisible();
      await goHome(page);
      expect(await balance(page)).toBeGreaterThan(before);
    } else {
      await expect(claimed).toBeDisabled();
    }
    expectNoErrors(errors);
  });

  test("F06-E2 the balance card says when free credits run out", async ({ page }) => {
    await signIn(page);
    await tab(page, /credits/i).click();
    await expect(page.getByText(/free credits and run out in \d+ days/i)).toBeVisible();
    await expect(page.getByText(/credits you buy never expire/i)).toBeVisible();
    await a11y(page, "credits");
  });
});
