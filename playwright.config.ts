import { defineConfig, devices } from "@playwright/test";

const PORT = 8099;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,        // the in-memory data layer is shared per page load
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // `channel: "chrome"` uses the system Chrome, so the suite runs without
    // waiting on a Playwright browser download. Drop the channel to use the
    // pinned Chromium once `npx playwright install chromium` has finished.
    {
      name: "phone",
      use: { ...devices["iPhone 14"], channel: "chrome", isMobile: false, hasTouch: true },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel: "chrome",
             viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `node scripts/serve-web.mjs dist`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
