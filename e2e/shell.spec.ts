import { test, expect } from "@playwright/test";
import { a11y, expectNoErrors, tab, watchForErrors } from "./helpers";

test.describe("shell", () => {
  test("S-H1 the app loads and lists the tools", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await expect(page.getByText("Make something")).toBeVisible();
    for (const name of [/photo to video/i, /talking baby/i, /dancing baby/i,
                        /cartoon baby/i, /grow up/i, /fruit baby/i]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
    expectNoErrors(errors);
  });

  test("S-H2 every tab renders", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");
    await tab(page, /yours/i).click();
    await expect(page.getByRole("heading", { name: /your videos/i })).toBeVisible();
    await tab(page, /credits/i).click();
    await expect(page.getByRole("heading", { name: /^credits$/i })).toBeVisible();
    await tab(page, /make/i).click();
    await expect(page.getByText("Make something")).toBeVisible();
    expectNoErrors(errors);
  });

  test("S-E1 no horizontal scroll at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/", "/credits", "/creations", "/tool/baby-video"]) {
      await page.goto(path);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("S-E2 keyboard reaches the tools", async ({ page }) => {
    await page.goto("/");
    const reached: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute("aria-label") ?? el?.innerText?.slice(0, 40) ?? "";
      });
      if (label) reached.push(label);
      if (reached.some((l) => /photo to video/i.test(l))) break;
    }
    expect(reached.some((l) => /photo to video/i.test(l)),
      `tab order never reached the first tool. Reached: ${reached.join(" | ")}`).toBe(true);
  });

  test("S-A1 no serious a11y violations on the main screens", async ({ page }) => {
    await page.goto("/");                 await a11y(page, "home");
    await page.goto("/credits");          await a11y(page, "credits");
    await page.goto("/creations");        await a11y(page, "creations");
    await page.goto("/tool/baby-video");  await a11y(page, "editor");
    await page.goto("/sign-in");          await a11y(page, "sign-in");
  });
});
