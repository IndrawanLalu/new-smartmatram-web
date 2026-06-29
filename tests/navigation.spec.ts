import { test, expect } from "@playwright/test";

// Semua test di file ini memakai storageState hasil login dari auth.setup.ts

test("user yang sudah login redirect ke admin saat buka /login", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/admin\//);
});

test("command center tampil", async ({ page }) => {
  await page.goto("/admin/command-center");
  await expect(page).toHaveURL(/\/admin\/command-center/);
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("sidebar navigasi tampil", async ({ page }) => {
  await page.goto("/admin/command-center");
  // Sidebar minimal punya link ke beberapa halaman
  await expect(page.locator("nav, aside").first()).toBeVisible();
});

test("halaman pengukuran gardu dapat diakses", async ({ page }) => {
  await page.goto("/admin/pengukuran-gardu");
  await expect(page).toHaveURL(/\/admin\/pengukuran-gardu/);
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("halaman monitoring inspeksi dapat diakses", async ({ page }) => {
  await page.goto("/admin/monitoring-inspeksi");
  await expect(page).toHaveURL(/\/admin\/monitoring-inspeksi/);
  await expect(page.locator("h1, h2").first()).toBeVisible();
});

test("halaman scoreboard dapat diakses", async ({ page }) => {
  await page.goto("/admin/scoreboard");
  await expect(page).toHaveURL(/\/admin\/scoreboard/);
  await expect(page.locator("h1, h2").first()).toBeVisible();
});
