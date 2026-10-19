import { test } from "@playwright/test";
import { signIn, tab } from "./helpers";

test("credits screen contents", async ({ page }) => {
  await signIn(page);
  await tab(page, /credits/i).click();
  await page.waitForTimeout(1200);
  const items = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("[role]").forEach((el) => {
      const r = el.getAttribute("role");
      if (!["button","heading","tab"].includes(r ?? "")) return;
      out.push(`${r} aria="${el.getAttribute("aria-label") ?? ""}" text="${(el as HTMLElement).innerText?.replace(/\s+/g," ").slice(0,60)}"`);
    });
    return out;
  });
  console.log("\n=== CREDITS ===\n" + items.join("\n"));
});
