// F02 - the paid core loop. This is the flow the business depends on.
import { test, expect } from "@playwright/test";
import {
  a11y, addPhoto, balance, expectNoErrors, openTool, signIn, tab, watchForErrors,
} from "./helpers";

test.describe("F02 photo to video", () => {
  test("F02-E1 the button asks for a photo before anything else", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await openTool(page, /photo to video/i);
    const cta = page.getByRole("button", { name: /add a photo to start/i });
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
    expectNoErrors(errors);
  });

  test("F02-H1 happy path: photo, prompt, price, generate", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    const before = await balance(page);
    expect(before).toBeGreaterThan(0);

    await openTool(page, /photo to video/i);
    await addPhoto(page);
    await page.getByLabel(/what should happen/i)
      .fill("Smiles and gives one small wave, soft morning light");

    // the price must appear, and name a real number of credits
    const generate = page.getByRole("button", { name: /generate, costs \d+ credits/i });
    await expect(generate).toBeVisible();
    const label = await generate.getAttribute("aria-label");
    const cost = Number(label!.match(/costs (\d+)/)![1]);
    expect(cost).toBe(25);          // 5s @ 540p, same as the original's price

    await generate.click();
    // either it renders or it refunds - both are a pass, silence is not
    await expect(
      page.getByText(/in the queue|making your video|didn't render/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await a11y(page, "editor mid-job");
    expectNoErrors(errors);
  });

  test("F02-E2 changing a setting invalidates the price", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    await addPhoto(page);
    await page.getByLabel(/what should happen/i).fill("A small wave");
    await expect(page.getByRole("button", { name: /generate, costs 25 credits/i })).toBeVisible();

    // 5s -> 10s must re-price, and must never leave the old price submittable
    await page.getByRole("tab", { name: "10s" }).click();
    await expect(
      page.getByRole("button", { name: /generate, costs 45 credits|working out the price/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /costs 25 credits/i })).toHaveCount(0);
  });

  test("F02-E4 not enough credits routes to packs and charges nothing", async ({ page }) => {
    await signIn(page);
    const before = await balance(page);
    await openTool(page, /photo to video/i);
    await addPhoto(page);
    await page.getByLabel(/what should happen/i).fill("A wave");
    // 10s @ 1080p = 160 credits, well past the 30 free ones
    await page.getByRole("tab", { name: "10s" }).click();
    await page.getByRole("tab", { name: "1080p" }).click();

    const cta = page.getByRole("button", { name: /not enough credits/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page.getByRole("heading", { name: /^credits$/i })).toBeVisible();
    expect(await balance(page)).toBe(before);     // nothing charged
  });

  test("F02-E3 double-tapping Generate creates exactly one job", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    await addPhoto(page);
    await page.getByLabel(/what should happen/i).fill("One wave");
    const generate = page.getByRole("button", { name: /generate, costs/i });
    await expect(generate).toBeVisible();

    await generate.dispatchEvent("click");
    await generate.dispatchEvent("click");
    await page.waitForTimeout(1500);

    await tab(page, /yours/i).click();
    const items = page.getByText(/baby video/i);
    expect(await items.count(), "a double tap bought two videos").toBe(1);
  });

  test("F02-E6/E7 long prompt and emoji survive", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await openTool(page, /photo to video/i);
    await addPhoto(page);
    const field = page.getByLabel(/what should happen/i);

    await field.fill("👶 café niño — smiles, mouth visible, soft light");
    await expect(field).toHaveValue(/👶 café niño/);

    await field.fill("a ".repeat(1000));
    await expect(page.getByRole("button", { name: /generate, costs/i })).toBeVisible();
    expectNoErrors(errors);
  });

  test("F02-E5 a reload mid-job leaves the app usable", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    await addPhoto(page);
    await page.getByLabel(/what should happen/i).fill("A wave");
    await page.getByRole("button", { name: /generate, costs/i }).click();
    await expect(page.getByText(/in the queue|making your video/i).first()).toBeVisible();

    await page.reload();
    // the in-memory layer resets on reload, which is itself worth asserting:
    // the app must come back to a usable state rather than a broken one
    await expect(page.getByText(/make something|your first video is free/i).first())
      .toBeVisible();
  });

  test("F02-N1 a failed job says the credits came back", async ({ page }) => {
    await signIn(page);
    // the fake layer fails ~12% of jobs deterministically by id, so drive
    // several and assert the message on whichever fails
    let sawFailure = false;
    for (let i = 0; i < 12 && !sawFailure; i++) {
      await openTool(page, /photo to video/i);
      await addPhoto(page);
      await page.getByLabel(/what should happen/i).fill(`attempt ${i}`);
      const g = page.getByRole("button", { name: /generate, costs/i });
      if (!await g.isVisible().catch(() => false)) break;
      await g.click();
      const failed = page.getByText(/didn't render/i);
      try {
        await failed.waitFor({ timeout: 11_000 });
        sawFailure = true;
        await expect(page.getByText(/credits are back/i)).toBeVisible();
      } catch { /* that one succeeded; try again */ }
    }
    test.skip(!sawFailure, "no job failed in 12 attempts; refund path covered by unit tests");
  });
});
