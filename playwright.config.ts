import { defineConfig } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Tests run against the BUILT single file over file:// — exactly how operators
// use it (offline, no server). Run `npm run build` first (npm run test:e2e does).
export const APP_URL = pathToFileURL(path.resolve("dist/index.html")).href;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  use: {
    viewport: { width: 1280, height: 800 },
    video: "on",
    acceptDownloads: true,
    launchOptions: { slowMo: 350 }, // makes the recordings watchable
  },
});
