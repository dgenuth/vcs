// GROUP C (Session 7) — Settings header audit, Role Tab Defaults, User Mgmt indent
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndSettings(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'settings';
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group C (S7) — Settings audit, Role Tab Defaults, User Mgmt', () => {

  test('C1: Role Tab Defaults h3 does not override CSS font-size', async ({ page }) => {
    await loginAndSettings(page);
    const noBadFontSize = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      // Should NOT have fontSize:12px on Role Tab Defaults h3
      return !src.includes("'🎭 Role Tab Defaults'") ||
             !src.includes("fontSize:'12px'");
    });
    expect(noBadFontSize).toBeTruthy();
  });

  test('C1: User Management h3 does not have display:inline', async ({ page }) => {
    await loginAndSettings(page);
    const noInline = await page.evaluate(() =>
      !document.documentElement.innerHTML.includes("display:'inline'},'👥 User Management'")
    );
    expect(noInline).toBeTruthy();
  });

  test('C2: Role Tab Defaults shows hidden field count badge', async ({ page }) => {
    await loginAndSettings(page);
    const hasHiddenCount = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('fields hidden')
    );
    expect(hasHiddenCount).toBeTruthy();
  });

  test('C2: Role Tab Defaults hidden field badge uses _rhidden variable', async ({ page }) => {
    await loginAndSettings(page);
    const hasBadge = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_rhidden.length+\' fields hidden\'') ||
      document.documentElement.innerHTML.includes("_rhidden.length+' fields hidden'")
    );
    expect(hasBadge).toBeTruthy();
  });

  test('C3: User Management details indented to 34px (past checkbox+expand)', async ({ page }) => {
    await loginAndSettings(page);
    const hasIndent = await page.evaluate(() =>
      document.documentElement.innerHTML.includes("paddingLeft:'34px'")
    );
    expect(hasIndent).toBeTruthy();
  });

});
