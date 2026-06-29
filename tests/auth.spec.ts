import { test, expect } from "@playwright/test";

// Semua test di file ini berjalan tanpa session (unauthenticated)
test.use({ storageState: { cookies: [], origins: [] } });

test("halaman login tampil dengan benar", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("akses /admin tanpa login redirect ke /login", async ({ page }) => {
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login dengan kredensial salah tampil pesan error", async ({ page }) => {
  await page.goto("/login");

  await page.fill('input[name="email"]', "salah@pln.co.id");
  await page.fill('input[name="password"]', "passwordsalah");
  await page.click('button[type="submit"]');

  const errorMsg = page
    .locator('[class*="red"]')
    .or(page.locator("text=Invalid"))
    .or(page.locator("text=salah"))
    .or(page.locator("text=gagal"));

  await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });
});
