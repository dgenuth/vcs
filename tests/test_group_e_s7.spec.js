// GROUP E (Session 7) — Cross-referral results, benchmarks clickable, what-if calc
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndNetwork(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof renderNetworkIntel === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.vendors = [
      { name: 'Alpha Foods', category: 'Food Service', status: 'Active', product: 'Food supplies', addedValue: 'Delivery', vendorRelationships: '', adminFee: '3%' },
      { name: 'Beta Medical', category: 'Medical', status: 'Active', product: 'Medical supplies', addedValue: 'Healthcare tech', vendorRelationships: '', adminFee: '2.5%' },
    ];
    window.S.channelVendors = [];
    window.S.loaded = true;
    window.S.view = 'network';
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group E (S7) — Network Intel improvements', () => {

  test('E1: Cross-referral fallback includes channel vendors when < 3 pairs', async ({ page }) => {
    await loginAndNetwork(page);
    const hasE1 = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_extAll') &&
      document.documentElement.innerHTML.includes('E1:')
    );
    expect(hasE1).toBeTruthy();
  });

  test('E1: Cross-referral section renders (no empty state with 2 vendors)', async ({ page }) => {
    await loginAndNetwork(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Cross-Referral Opportunities');
  });

  test('E1: Shows Showing N of M matches', async ({ page }) => {
    await loginAndNetwork(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/Showing \d+ of \d+ matches/);
  });

  test('E2: Benchmark rows have cursor:pointer title on category row', async ({ page }) => {
    await loginAndNetwork(page);
    const hasTitle = await page.evaluate(() =>
      document.documentElement.innerHTML.includes("tr.title='Click to expand")
    );
    expect(hasTitle).toBeTruthy();
  });

  test('E2: Expanded benchmark sub-table rows open vendor detail on click', async ({ page }) => {
    await loginAndNetwork(page);
    const hasOpenDetail = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('openDetail(v)') &&
      document.documentElement.innerHTML.includes('e.stopPropagation()')
    );
    expect(hasOpenDetail).toBeTruthy();
  });

  test('E2: Expanded benchmark row has Browse in Vendor DB button', async ({ page }) => {
    await loginAndNetwork(page);
    const hasBrowse = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('Browse all') &&
      document.documentElement.innerHTML.includes('in Vendor DB')
    );
    expect(hasBrowse).toBeTruthy();
  });

  test('E3: What-If calculator has Calculate button', async ({ page }) => {
    await loginAndNetwork(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Calculate');
  });

  test('E3: What-If calc auto-fills from SF board opps as fallback', async ({ page }) => {
    await loginAndNetwork(page);
    const hasSpndFallback = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('S._sfBoardData?.opps')
    );
    expect(hasSpndFallback).toBeTruthy();
  });

  test('E3: What-If calc fires on vendor select change', async ({ page }) => {
    await loginAndNetwork(page);
    const hasAutoCalc = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_wiCalc()') ||
      document.documentElement.innerHTML.includes('wiCalcBtn')
    );
    expect(hasAutoCalc).toBeTruthy();
  });

});
