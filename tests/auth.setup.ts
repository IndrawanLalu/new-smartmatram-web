import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

setup("login dan simpan session", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[name="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[name="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');

  await page.waitForURL("**/admin/**", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/admin\//);

  await page.context().storageState({ path: authFile });
});
