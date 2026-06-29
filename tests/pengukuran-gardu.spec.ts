import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/admin/pengukuran-gardu");
});

test("halaman load tanpa error", async ({ page }) => {
  await expect(page.locator("h1, h2").first()).toBeVisible();
  // Tidak ada error boundary / 500 page
  await expect(page.locator("text=500")).not.toBeVisible();
  await expect(page.locator("text=Error")).not.toBeVisible();
});

test("tombol Tampilkan ada dan bisa diklik", async ({ page }) => {
  const btn = page.locator("button", { hasText: "Tampilkan" });
  await expect(btn).toBeVisible();
  await btn.click();

  // Setelah klik, loading spinner muncul lalu tabel tampil
  await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
});

test("filter penyulang tersedia", async ({ page }) => {
  // Ada dropdown atau input filter di halaman
  const filterArea = page.locator("select, input[placeholder*='penyulang' i]").first();
  await expect(filterArea).toBeVisible();
});
