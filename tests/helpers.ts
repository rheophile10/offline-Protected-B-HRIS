import { Page, expect } from "@playwright/test";
import { APP_URL } from "../playwright.config";

export const PASS = "demo-pass";

/** Boot the built app and load the fictional demo dataset with a passphrase. */
export async function startDemo(page: Page, pass = PASS): Promise<void> {
  await page.goto(APP_URL);
  await expect(page.locator(".gate")).toBeVisible({ timeout: 20_000 });
  await page.fill(".gate input[type=password]", pass);
  await page.getByRole("button", { name: /Start session/ }).click();
}

/** Pick the first operator identity at the user gate → lands on the dashboard. */
export async function pickOperator(page: Page): Promise<void> {
  await expect(page.locator(".user-pick").first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".user-pick").first().click();
  await expect(page.locator(".kpi").first()).toBeVisible({ timeout: 10_000 });
}

export async function nav(page: Page, label: string): Promise<void> {
  await page.locator(".navitem", { hasText: label }).click();
}

export function officersKpi(page: Page) {
  return page.locator(".kpi .kpi-value").first();
}

/** Full "logged in on the dashboard" starting point used by most stories. */
export async function openDemoDashboard(page: Page): Promise<void> {
  await startDemo(page);
  await pickOperator(page);
}
