import { expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * IMPORTANT: `page.goto` is a full navigation, which reloads the SPA and
 * resets the in-memory data layer - so a session created by signIn() is lost.
 * After signing in, navigate by CLICKING, never by goto. The helpers below
 * all click.
 */

export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // react-native-web noise, not defects in the app under test
    if (/NativeModule|not supported on web|useNativeDriver|was not wrapped in act/i.test(t)) return;
    errors.push(t);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} on ${r.url()}`);
  });
  return errors;
}

export function expectNoErrors(errors: string[]) {
  expect(errors, `console/network errors:\n${errors.join("\n")}`).toEqual([]);
}

export async function a11y(page: Page, label: string) {
  const res = await new AxeBuilder({ page })
    .disableRules(["region"])   // an RN-web root is one big div
    .analyze();
  const serious = res.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious");
  expect(serious, `${label} a11y:\n${serious.map((v) =>
    `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}`).join("\n")}`).toEqual([]);
}

/**
 * expo-router renders tab items as <a role="tab">. The accessible name also
 * picks up the decorative icon glyph, so match on a substring rather than
 * anchoring - see BUG-001, which is about that glyph being announced at all.
 */
export function tab(page: Page, name: RegExp): Locator {
  return page.getByRole("tab", { name }).first();
}

export async function goHome(page: Page) {
  await tab(page, /make/i).click();
  await expect(page.getByText("Make something")).toBeVisible();
}

/** Signs in through the UI. Call this ONCE per test, right after one goto. */
export async function signIn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /get started/i }).click();
  await page.getByRole("button", { name: /continue with apple/i }).click();
  // the balance chip only exists once signed in
  await expect(balanceChip(page)).toBeVisible();
}

export function balanceChip(page: Page): Locator {
  return page.getByRole("button", { name: /^\d+ credits/ }).first();
}

export async function balance(page: Page): Promise<number> {
  const label = await balanceChip(page).getAttribute("aria-label");
  const m = label?.match(/^(\d+) credits/);
  return m ? Number(m[1]) : NaN;
}

/** Opens a tool by clicking it on the home list, preserving the session. */
export async function openTool(page: Page, name: RegExp) {
  await goHome(page);
  await page.getByRole("button", { name }).click();
}

export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAwMDAwAHgAC/1Zs8gAAAABJRU5ErkJggg==",
  "base64",
);

/** Attaches a real PNG through whatever file input the picker opens. */
export async function addPhoto(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /baby photo/i }).click();
  const fc = await chooser;
  await fc.setFiles({ name: "baby.png", mimeType: "image/png", buffer: TINY_PNG });
}
