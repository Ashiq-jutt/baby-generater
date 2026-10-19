// F03 and F04 are blocked on inputs that are not built. A screen that is
// honest about that is a pass; a dead control that looks usable is a bug.
import { test, expect } from "@playwright/test";
import { addPhoto, expectNoErrors, openTool, signIn, watchForErrors } from "./helpers";

test.describe("unbuilt inputs are honest, not broken", () => {
  test("F03-H1 talking baby says recording is not built", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await openTool(page, /talking baby/i);
    await expect(page.getByText(/recording not built yet/i)).toBeVisible();
    // and the button must not pretend it can run
    await expect(page.getByRole("button", { name: /add a photo to start/i })).toBeDisabled();
    expectNoErrors(errors);
  });

  test("F04-H1 dancing baby says the motion picker is not built", async ({ page }) => {
    const errors = watchForErrors(page);
    await signIn(page);
    await openTool(page, /dancing baby/i);
    await expect(page.getByText(/motion picker not built yet/i)).toBeVisible();
    expectNoErrors(errors);
  });

  test("cartoon baby is fully usable and priced at 2 credits", async ({ page }) => {
    await signIn(page);
    await openTool(page, /cartoon baby/i);
    await addPhoto(page);
    await expect(page.getByRole("button", { name: /generate, costs 2 credits/i })).toBeVisible();
  });

  test("the skin tone control is present and defaults to unset", async ({ page }) => {
    // F31: the differentiator. It must default to UNSET, never to the
    // lightest tone, and every swatch must carry a text label.
    await signIn(page);
    await openTool(page, /photo to video/i);
    await expect(page.getByText(/we'll read it from your photo/i)).toBeVisible();

    const group = page.getByRole("radiogroup", { name: /skin tone/i });
    await expect(group).toBeVisible();
    const swatches = group.getByRole("radio");
    expect(await swatches.count()).toBe(6);
    for (let i = 0; i < 6; i++) {
      const label = await swatches.nth(i).getAttribute("aria-label");
      expect(label, "a swatch has no text label - colour alone is not enough")
        .toMatch(/skin tone/i);
      expect(await swatches.nth(i).getAttribute("aria-checked")).toBe("false");
    }

    await swatches.nth(4).click();
    await expect(swatches.nth(4)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/tap again to clear/i)).toBeVisible();
    await swatches.nth(4).click();
    await expect(page.getByText(/we'll read it from your photo/i)).toBeVisible();
  });
});
