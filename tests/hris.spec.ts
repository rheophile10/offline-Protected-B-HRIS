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

test("US-7 recruit an applicant and hire them as an officer", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Recruitment");
  await expect(page.locator(".kanban")).toBeVisible();
  await expect(page.locator(".kcol.offer")).toContainText("Fabiola Meraz");

  // add a new applicant to the pipeline
  await page.getByRole("button", { name: /Add applicant/ }).click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal input").nth(0).fill("Nuevo Aspirante");
  await page.locator(".modal").getByRole("button", { name: /Add to pipeline/ }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
  await expect(page.locator(".kcol.applied")).toContainText("Nuevo Aspirante");

  // hire the applicant sitting at the Offer stage → creates an officer
  await page.locator(".kcol.offer").getByRole("button", { name: /Hire/ }).first().click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal input[type=number]").first().fill("9200");
  await page.locator(".modal").getByRole("button", { name: /create officer/ }).click();
  await expect(page.locator(".modal")).toHaveCount(0);

  // the hire is now an officer on the roster and the headcount rose
  await nav(page, "Dashboard");
  await expect(officersKpi(page)).toHaveText("28");
  await nav(page, "Officers");
  await expect(page.getByRole("cell", { name: "Fabiola Meraz" })).toBeVisible();
});

test("US-8 review compliance and renew an expired certification", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Compliance");
  // the compliance dashboard surfaces expiring/expired counts
  const expired = page.locator(".kpi-btn.bad .kpi-value");
  await expect(expired).toHaveText("30");
  await expect(page.getByText(/Firearms-current/)).toBeVisible();

  // drill into expired certs, then renew the first one
  await page.locator(".kpi-btn.bad").click();
  await expect(page.locator(".tbl tbody tr").first()).toContainText("Expired");
  await page.locator(".tbl tbody tr").first().getByRole("button", { name: "Renew" }).click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.locator(".modal").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);

  // one fewer expired certification after the renewal
  await expect(expired).toHaveText("29");
});

test("US-9 request and approve leave", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Leave");
  const pending = page.locator(".kpi.warn .kpi-value"); // pending-requests card
  await expect(pending).toHaveText("3");
  await expect(page.getByText("Currently on leave")).toBeVisible();
  // approve the first pending request → pending count drops
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(pending).toHaveText("2");
});

test("US-10 project workforce retirement exposure", async ({ page }) => {
  await openDemoDashboard(page);
  await nav(page, "Planning");
  await expect(page.getByText("Projected vacancy deficit by horizon")).toBeVisible();
  await expect(page.getByRole("cell", { name: "+5 years" })).toBeVisible();
  await expect(page.getByText("Officers nearing pension eligibility")).toBeVisible();
  await expect(page.locator(".tbl").nth(1).locator("tbody tr").first()).toBeVisible();
});

test("US-11 audit shows attributed changes and session events", async ({ page }) => {
  await openDemoDashboard(page);
  // create an attributed change
  await nav(page, "Officers");
  await page.getByRole("button", { name: /Add officer/ }).click();
  await page.locator(".modal input").nth(0).fill("9300");
  await page.locator(".modal input").nth(1).fill("Audit Trail");
  await page.locator(".modal").getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
  // the audit screen attributes it and lists session events
  await nav(page, "Audit");
  await expect(page.locator(".card").first()).toContainText("Audit Trail");
  await expect(page.getByText("session_open")).toBeVisible();
});

test("US-6 lock the session to clear memory", async ({ page }) => {
  await openDemoDashboard(page);
  await page.getByRole("button", { name: /Lock session/ }).click();
  // back at the locked gate — the in-memory database is gone
  await expect(page.locator(".gate")).toBeVisible();
});
