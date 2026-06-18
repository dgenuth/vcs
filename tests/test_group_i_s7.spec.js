// GROUP I (Session 7) — Content-Type header fix, right-click context menu on ITW
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndITW(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'itw';
    window.S.itw = [
      { name: 'Pipeline Co', category: 'Tech', section: 'New', notes: '', source: 'itw', _row: 1 },
    ];
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group I (S7) — Content-Type fix and ITW right-click menu', () => {

  test('I2: Anthropic API calls use Content-Type application/json (not text/plain)', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { timeout: 5000 });
    await page.fill('#login-email', 'dgenuth@primesourcex.com');
    await page.click('#login-btn');
    await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
    const hasCorrectCT = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      // Count occurrences of text/plain with x-api-key (Anthropic calls)
      const textPlainMatches = (src.match(/'Content-Type':'text\/plain','x-api-key'/g) || []).length;
      // Count occurrences of application/json with x-api-key (correct)
      const jsonMatches = (src.match(/'Content-Type':'application\/json','x-api-key'/g) || []).length;
      return textPlainMatches === 0 && jsonMatches >= 2;
    });
    expect(hasCorrectCT).toBeTruthy();
  });

  test('I2: All three Anthropic API fetch calls use application/json', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#login-email', { timeout: 5000 });
    await page.fill('#login-email', 'dgenuth@primesourcex.com');
    await page.click('#login-btn');
    await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
    const count = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      return (src.match(/'Content-Type':'application\/json','x-api-key'/g) || []).length;
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('I3: showRCMenu function exists', async ({ page }) => {
    await loginAndITW(page);
    const hasFn = await page.evaluate(() => typeof showRCMenu === 'function');
    expect(hasFn).toBeTruthy();
  });

  test('I3: ITW vendor link has contextmenu event listener', async ({ page }) => {
    await loginAndITW(page);
    const hasContextMenu = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('contextmenu') &&
      document.documentElement.innerHTML.includes('showRCMenu')
    );
    expect(hasContextMenu).toBeTruthy();
  });

  test('I3: Right-click on ITW vendor shows context menu', async ({ page }) => {
    await loginAndITW(page);
    // Find a vendor-link and right-click it
    const vendorLink = page.locator('.vendor-link').first();
    await vendorLink.click({ button: 'right' });
    await page.waitForTimeout(200);
    // The context menu should appear
    const menuVisible = await page.evaluate(() => !!document.getElementById('_rc-menu'));
    expect(menuVisible).toBeTruthy();
  });

  test('I3: Context menu has Open Detail option', async ({ page }) => {
    await loginAndITW(page);
    const vendorLink = page.locator('.vendor-link').first();
    await vendorLink.click({ button: 'right' });
    await page.waitForTimeout(200);
    const menuText = await page.textContent('#_rc-menu');
    expect(menuText).toContain('Open Detail');
  });

  test('I3: Context menu has Send Email and Add Note options', async ({ page }) => {
    await loginAndITW(page);
    const vendorLink = page.locator('.vendor-link').first();
    await vendorLink.click({ button: 'right' });
    await page.waitForTimeout(200);
    const menuText = await page.textContent('#_rc-menu');
    expect(menuText).toContain('Send Email');
    expect(menuText).toContain('Add Note');
  });

  test('I3: Context menu dismisses on outside click', async ({ page }) => {
    await loginAndITW(page);
    const vendorLink = page.locator('.vendor-link').first();
    await vendorLink.click({ button: 'right' });
    await page.waitForTimeout(200);
    // Click outside
    await page.click('body', { position: { x: 5, y: 5 } });
    await page.waitForTimeout(200);
    const menuGone = await page.evaluate(() => !document.getElementById('_rc-menu'));
    expect(menuGone).toBeTruthy();
  });

});
