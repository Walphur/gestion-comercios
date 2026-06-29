import { defineConfig } from "@playwright/test";
import path from "node:path";

const root = process.cwd();

export default defineConfig({
  testDir: path.join(root, "tests"),
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: path.join(root, "tests", "support", "global-setup.ts"),
  globalTeardown: path.join(root, "tests", "support", "global-teardown.ts"),
  globalTimeout: 900_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(root, "tests", "reports", "html"), open: "never" }],
    ["json", { outputFile: path.join(root, "tests", "reports", "results.json") }],
    [path.join(root, "tests", "support", "reporters", "e2e-summary.ts")],
  ],
  outputDir: path.join(root, "tests", "results"),
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "tauri-e2e",
      testIgnore: /stress\//,
    },
    {
      name: "stress",
      testMatch: /stress\/.*\.spec\.ts/,
      timeout: 600_000,
    },
  ],
});
