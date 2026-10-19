// Three defects found by reading the accessibility tree, fixed, and kept as
// regression tests. See replica/bugs.md BUG-001..003.
import { test, expect } from "@playwright/test";
import { openTool, signIn } from "./helpers";

test.describe("accessibility regressions", () => {
  test("BUG-001 a tab's accessible name is just its label", async ({ page }) => {
    await page.goto("/");
    // wait for the tab bar to settle, or this races the first render
    await expect(page.getByRole("tab").first()).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);

    // `exact` matches the computed ACCESSIBLE NAME, which excludes aria-hidden
    // subtrees. innerText does not, so it is the wrong probe for this.
    for (const label of ["Make", "Yours", "Credits"]) {
      await expect(
        page.getByRole("tab", { name: label, exact: true }),
        `the decorative glyph is part of the "${label}" tab's accessible name`,
      ).toHaveCount(1);
    }
  });

  test("BUG-002 the editor has a real, non-empty heading", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    await expect(page.getByRole("heading", { name: /photo to video/i })).toBeVisible();

    const texts = await Promise.all(
      (await page.locator("h1,h2,h3,[role=heading]").all())
        .map((h) => h.evaluate((el) => (el as HTMLElement).innerText.trim())));
    expect(texts.filter((t) => t === "").length,
      `empty heading(s) on the editor: ${JSON.stringify(texts)}`).toBe(0);
  });

  test("BUG-003 the screen behind the editor is not announced", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    await expect(page.getByRole("heading", { name: /photo to video/i })).toBeVisible();

    // home is still mounted underneath; it must be out of the a11y tree, or a
    // screen reader reads the wrong screen
    for (const name of [/talking baby/i, /dancing baby/i, /fruit baby/i]) {
      await expect(page.getByRole("button", { name }),
        "a tool from the screen behind is still exposed").toHaveCount(0);
    }
  });

  test("the back control on the editor is reachable and labelled", async ({ page }) => {
    await signIn(page);
    await openTool(page, /photo to video/i);
    const back = page.getByRole("button", { name: /^back$/i });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page.getByText("Make something")).toBeVisible();
  });
});
