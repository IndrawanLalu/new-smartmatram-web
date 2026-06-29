import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin/monitoring-inspeksi");
  await page.waitForLoadState("networkidle");
});

test("halaman load tanpa error", async ({ page }) => {
  await expect(page.locator("h1, h2").first()).toBeVisible();
  await expect(page.locator("text=500")).not.toBeVisible();
});

test("KPI cards tampil", async ({ page }) => {
  // Minimal ada beberapa angka statistik
  const cards = page.locator('[class*="card"], [class*="Card"]').or(
    page.locator("div").filter({ hasText: /^\d+$/ })
  );
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
});

test("tab Jaringan dan Pohon tersedia", async ({ page }) => {
  await expect(
    page.locator("button, [role='tab']", { hasText: /jaringan/i }).first()
  ).toBeVisible();
  await expect(
    page.locator("button, [role='tab']", { hasText: /pohon/i }).first()
  ).toBeVisible();
});

test("switch ke tab Peta tidak crash", async ({ page }) => {
  const petaTab = page.locator("button, [role='tab']", { hasText: /peta/i }).first();
  await expect(petaTab).toBeVisible();
  await petaTab.click();
  // Map container muncul (Leaflet)
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 10_000 });
});
