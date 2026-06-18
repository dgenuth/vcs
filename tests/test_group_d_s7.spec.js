// GROUP D (Session 7) — Today sections collapse, queue table layout, score pill first
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndToday(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'today';
    window.S.vendors = [
      { name: 'Vendor A', category: 'Food', tier: 'CALL', score: 8.5, status: 'Active', vendorRelationships: '' },
      { name: 'Vendor B', category: 'Medical', tier: 'EMAIL', score: 6.2, status: 'Active', vendorRelationships: '' },
    ];
    window.S._todaySecOpen = { urgent: true, call: true, email: true, review: false, pipeline: false, stats: false };
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group D (S7) — Today collapse, queue table, score pill', () => {

  test('D1: Expand All button exists in Today tab', async ({ page }) => {
    await loginAndToday(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Expand All');
  });

  test('D1: Collapse All button exists in Today tab', async ({ page }) => {
    await loginAndToday(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Collapse All');
  });

  test('D1: Collapse All button sets all sections to closed', async ({ page }) => {
    await loginAndToday(page);
    // Find and click Collapse All
    await page.evaluate(() => {
      // Simulate clicking collapse all
      const btns = Array.from(document.querySelectorAll('button'));
      const collapseBtn = btns.find(b => b.textContent.includes('Collapse All'));
      if (collapseBtn) collapseBtn.click();
    });
    await page.waitForTimeout(300);
    const allClosed = await page.evaluate(() => {
      if (!window.S || !window.S._todaySecOpen) return false;
      return Object.values(window.S._todaySecOpen).every(v => v === false);
    });
    expect(allClosed).toBeTruthy();
  });

  test('D2: Call Queue has column header row with Score label', async ({ page }) => {
    await loginAndToday(page);
    const hasColHdr = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('hasHdr:true') &&
      document.documentElement.innerHTML.includes("hdrs:['Score','Vendor'")
    );
    expect(hasColHdr).toBeTruthy();
  });

  test('D2: Email Queue has column header row', async ({ page }) => {
    await loginAndToday(page);
    const hasEmailHdr = await page.evaluate(() =>
      document.documentElement.innerHTML.includes("hdrs:['Score','Vendor','Category','Reason','Email','Due']")
    );
    expect(hasEmailHdr).toBeTruthy();
  });

  test('D3: Score pill is first element in Call Queue row', async ({ page }) => {
    await loginAndToday(page);
    const scoreFirst = await page.evaluate(() => {
      // Check that scorePill appears before vendor name span in the Call Queue rowFn source
      const src = document.documentElement.innerHTML;
      const callIdx = src.indexOf("key:'call'");
      const scoreIdx = src.indexOf('scorePill(v.score)', callIdx);
      const nameIdx = src.indexOf("fontWeight:'700',fontSize:'11px',minWidth:'140px'", callIdx);
      return scoreIdx > 0 && nameIdx > 0 && scoreIdx < nameIdx;
    });
    expect(scoreFirst).toBeTruthy();
  });

  test('D3: Score pill is first element in Email Queue row', async ({ page }) => {
    await loginAndToday(page);
    const scoreFirst = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      const emailIdx = src.indexOf("key:'email'");
      const scoreIdx = src.indexOf('scorePill(v.score)', emailIdx);
      const nameIdx = src.indexOf("fontWeight:'700',fontSize:'11px',minWidth:'140px'", emailIdx);
      return scoreIdx > 0 && nameIdx > 0 && scoreIdx < nameIdx;
    });
    expect(scoreFirst).toBeTruthy();
  });

});
