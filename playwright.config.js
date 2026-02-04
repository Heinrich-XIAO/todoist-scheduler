import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    launchOptions: {
      args: ["--disable-gpu", "--disable-dev-shm-usage"],
    },
    viewport: { width: 1280, height: 720 },
  },
});
