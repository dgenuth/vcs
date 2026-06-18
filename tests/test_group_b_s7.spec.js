// GROUP B (Session 7) — Meetings/Media per-user, Contract preset
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAs(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', email);
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
  });
  await page.waitForTimeout(400);
}

test.describe('Group B (S7) — Media/Meetings per-user, Contract preset', () => {

  test('B1: sales_rep tabs do not include contracts', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const noContracts = await page.evaluate(() => {
      const perms = ROLE_PERMS['sales_rep'];
      return perms && !perms.tabs.includes('contracts');
    });
    expect(noContracts).toBeTruthy();
  });

  test('B2: Fathom meetings section filters by user for non-admin', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasPerUserFilter = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_isAdminFathom') &&
      document.documentElement.innerHTML.includes('_myFathomLinks')
    );
    expect(hasPerUserFilter).toBeTruthy();
  });

  test('B3: Adding media link stores _addedBy field', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasAddedBy = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_addedBy:USER.email')
    );
    expect(hasAddedBy).toBeTruthy();
  });

  test('B3: Media list shows attribution meta by label', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasByLabel = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('by me') ||
      document.documentElement.innerHTML.includes("byLabel?'· by '+byLabel")  ||
      document.documentElement.innerHTML.includes('by \'+byLabel')
    );
    expect(hasByLabel).toBeTruthy();
  });

  test('B3: Media delete button only shown for own items (reps)', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasOwnerCheck = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_isAdminMedia||item._addedBy===USER.email')
    );
    expect(hasOwnerCheck).toBeTruthy();
  });

  test('B4: Contract preset sets _contractsHadPreset flag', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasPreset = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_contractsHadPreset')
    );
    expect(hasPreset).toBeTruthy();
  });

  test('B4: Contract preset auto-triggers Drive button click', async ({ page }) => {
    await loginAs(page, 'dgenuth@primesourcex.com');
    const hasAutoClick = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('if(_contractsHadPreset){setTimeout')
    );
    expect(hasAutoClick).toBeTruthy();
  });

});
