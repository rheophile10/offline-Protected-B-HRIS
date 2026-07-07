import { test, expect } from "@playwright/test";
import { startDemo, pickOperator, openDemoDashboard, nav, officersKpi } from "./helpers";

// Each test is one user story. They also produce the how-to videos (video: 'on').

test("US-1 start a session and see the dashboard", async ({ page }) => {
  await startDemo(page);
  // operator identity gate
  await expect(page.locator(".user-pick").first()).toBeVisible();
  await pickOperator(page);
  // dashboard shows the fictional roster of 27 officers
  await expect(officersKpi(page)).toHaveText("27");
  await expect(page.getByText("Largest staffing gaps")).toBeVisible();
});

test("US-2 add an officer to the roster", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Officers");
  await page.getByRole("button", { name: /Add officer/ }).click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal input").nth(0).fill("9099");
  await page.locator(".modal input").nth(1).fill("Renata Aceves");
  await page.locator(".modal").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
  // new officer appears in the roster…
  await expect(page.getByRole("cell", { name: "Renata Aceves" })).toBeVisible();
  // …and the dashboard KPI reflects it
  await nav(page, "Dashboard");
  await expect(officersKpi(page)).toHaveText("28");
});

test("US-3 assign an officer to a position", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Assignments");
  const before = await page.locator(".tbl tbody tr").count();
  await page.getByRole("button", { name: /Assign officer/ }).click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal").getByRole("button", { name: "Assign" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page.locator(".tbl tbody tr")).toHaveCount(before + 1);
});

test("US-4 query data and export an encrypted CSV", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "SQL Console");
  await page.fill(".sql-editor textarea", "SELECT title, budgeted, filled, deficit FROM v_position_staffing ORDER BY deficit DESC;");
  await page.getByRole("button", { name: /Run/ }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export CSV/ }).click(),
  ]);
  // export is ciphertext, never a plain .csv
  expect(download.suggestedFilename()).toMatch(/\.csv\.enc$/);
});

test("US-5 export daily changes and merge them (no Node)", async ({ page }, testInfo) => {
  // Operator does a day's work and exports an encrypted delta.
  await openDemoDashboard(page);
  await nav(page, "Officers");
  await page.getByRole("button", { name: /Add officer/ }).click();
  await page.locator(".modal input").nth(0).fill("9077");
  await page.locator(".modal input").nth(1).fill("Field Update Officer");
  await page.locator(".modal").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);

  await nav(page, "Data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export my changes/ }).click(),
  ]);
  const changesFile = testInfo.outputPath("operator.hrischanges");
  await download.saveAs(changesFile);
  expect(download.suggestedFilename()).toMatch(/\.hrischanges$/);

  // Coordinator opens a FRESH truth and merges that file — entirely in-app.
  await startDemo(page);
  await pickOperator(page);
  await expect(officersKpi(page)).toHaveText("27");
  await nav(page, "Data");
  await page.setInputFiles("input[type=file][multiple]", changesFile);
  await expect(page.locator(".lint-list li")).toContainText(/applied/);
  await nav(page, "Dashboard");
  await expect(officersKpi(page)).toHaveText("28");
});

test("US-6 lock the session to clear memory", async ({ page }) => {
  await openDemoDashboard(page);
  await page.getByRole("button", { name: /Lock session/ }).click();
  // back at the locked gate — the in-memory database is gone
  await expect(page.locator(".gate")).toBeVisible();
});
