import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "fs";

const navigate = async (page, route) => {
  await page.evaluate((nextRoute) => {
    const url = nextRoute ? `/?page=${nextRoute}` : "/";
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, route);
};

test.describe("Todoist Scheduler Electron", () => {
  let electronApp;
  let page;

  test.beforeEach(async ({}, testInfo) => {
    const dataDir = testInfo.outputPath("data");
    fs.mkdirSync(dataDir, { recursive: true });

    electronApp = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        E2E_TEST: "1",
        TODOIST_SCHEDULER_DATA_DIR: dataDir,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test("home screen navigates to config and back", async () => {
    await expect(page.getByTestId("page-home")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Control Center" })).toBeVisible();

    const configCard = page
      .getByRole("heading", { name: "Configuration" })
      .locator("..")
      .locator("..");
    await configCard.getByRole("link", { name: "Open" }).click();

    await expect(page.getByTestId("page-life-blocks")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("page-home")).toBeVisible();
  });

  test("life blocks can add and delete entries", async () => {
    await navigate(page, "config");
    await expect(page.getByTestId("page-life-blocks")).toBeVisible();
    await expect(
      page.getByText("One-off 2025-01-10 09:00-10:00 (Focus)")
    ).toBeVisible();

    await page.getByRole("button", { name: "Weekly" }).click();
    await page.getByText("M", { exact: true }).first().click();
    const timeInputs = page.getByPlaceholder("HH:MM");
    await timeInputs.nth(0).fill("09:00");
    await timeInputs.nth(1).fill("11:00");
    await page.getByPlaceholder("Sleep, Gym, Commute").fill("Gym");
    await page.getByRole("button", { name: "Add block" }).click();

    const weeklyEntry = page.getByText("Weekly M 09:00-11:00 (Gym)");
    await expect(weeklyEntry).toBeVisible();
    await weeklyEntry.locator("..").getByRole("button", { name: "Delete block" }).click();
    await expect(page.getByText("Weekly M 09:00-11:00 (Gym)")).toHaveCount(0);
  });

  test("scheduler run shows success toast", async () => {
    await navigate(page, "scheduler");
    await expect(page.getByTestId("page-scheduler")).toBeVisible();
    await page.getByRole("button", { name: "Run scheduler now" }).click();
    await expect(page.getByText("Scheduler run completed")).toBeVisible();
  });

  test("daemon control toggles autostart and stops legacy", async () => {
    await navigate(page, "daemons");
    await expect(page.getByTestId("page-daemons")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();

    const autoSwitch = page.getByRole("switch");
    await expect(autoSwitch).toHaveAttribute("aria-checked", "false");
    await autoSwitch.click();
    await expect(autoSwitch).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Stop legacy daemon" }).click();
    await expect(page.getByText("Stopped")).toBeVisible();
  });

  test("usage data renders sample stats", async () => {
    await navigate(page, "data");
    await expect(page.getByTestId("page-usage")).toBeVisible();
    await expect(page.getByText("1h 0m")).toBeVisible();
    await expect(page.getByText("Deep work")).toBeVisible();
    await expect(page.getByText("Scheduler Run Auto")).toBeVisible();
  });

  test("task queue supports start, postpone, complete", async () => {
    await navigate(page, "queue");
    await expect(page.getByTestId("page-queue")).toBeVisible();
    await expect(page.getByText("Overdue Task")).toBeVisible();
    await expect(page.getByText("Today Task")).toBeVisible();
    await expect(page.getByText("Upcoming Task")).toBeVisible();

    const upcomingRow = page.getByTestId("task-upcoming-1");
    await upcomingRow.getByRole("button", { name: "Start task" }).click();
    await expect(page.getByText("Session started")).toBeVisible();

    const todayRow = page.getByTestId("task-today-1");
    await todayRow.getByRole("button", { name: "Postpone task" }).click();
    await expect(page.getByRole("heading", { name: "Postpone Task" })).toBeVisible();
    await page.getByPlaceholder("Why are you postponing?").fill("Need more context");
    await page.getByRole("button", { name: "Postpone" }).click();
    await expect(page.getByTestId("task-today-1")).toHaveCount(0);

    const overdueRow = page.getByTestId("task-overdue-1");
    await overdueRow.getByRole("button", { name: "Complete task" }).click();
    await expect(page.getByTestId("task-overdue-1")).toHaveCount(0);
  });

  test("overlay task can start", async () => {
    await navigate(page, "overlay");
    await expect(page.getByTestId("page-overlay")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Focus sprint" })).toBeVisible();

    await page.getByRole("button", { name: "Start Task" }).click();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  });

  test("quick start form submits", async () => {
    await navigate(page, "quick");
    await expect(page.getByTestId("page-quick")).toBeVisible();

    const startButton = page.getByRole("button", { name: "Start" });
    await expect(startButton).toBeDisabled();

    await page.getByPlaceholder("Write status update").fill("Write status update");
    await page.getByPlaceholder("Add a bit more context").fill("Prep for demo");

    await expect(startButton).toBeEnabled();
    await startButton.click();
    await expect(page.getByText("Could not start the task.")).toHaveCount(0);
  });
});
