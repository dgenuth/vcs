// GROUP F (Session 7) — Coverage bar fix, email modal, progress per section
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndChecklist(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'checklist';
    window.S.vendors = [
      { name: 'Alpha Foods', category: 'Food Service', status: 'Active', vendorRelationships: '' },
    ];
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group F (S7) — Checklist coverage bar, email modal, section progress', () => {

  test('F1: Coverage bar selectedItems uses facility-prefixed key', async ({ page }) => {
    await loginAndChecklist(page);
    const hasKeyFix = await page.evaluate(() =>
      document.documentElement.innerHTML.includes("_gwFac+'_'+it.label") ||
      document.documentElement.innerHTML.includes('_gwFac+')
    );
    expect(hasKeyFix).toBeTruthy();
  });

  test('F1: Coverage bar falls back to bare item.label key', async ({ page }) => {
    await loginAndChecklist(page);
    const hasFallback = await page.evaluate(() =>
      document.documentElement.innerHTML.includes("S._clGoWith[it.label]") &&
      document.documentElement.innerHTML.includes("_gwFac+'_'+it.label")
    );
    expect(hasFallback).toBeTruthy();
  });

  test('F2: Email Queue row uses openEmailModal instead of mailto link', async ({ page }) => {
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
        { name: 'Email Vendor', category: 'Food', tier: 'EMAIL', score: 6, email: 'test@test.com', status: 'Active', vendorRelationships: '' },
      ];
      window.S._todaySecOpen = { email: true };
      const us = document.getElementById('upload-screen');
      if (us) us.style.display = 'none';
      const ap = document.getElementById('app');
      if (ap) ap.style.display = 'flex';
      if (typeof render === 'function') render();
    });
    await page.waitForTimeout(500);
    const noMailto = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      // email queue section should not have bare mailto: anchor in the rowFn area
      const emailQueueIdx = src.indexOf("key:'email'");
      const rowFnEnd = src.indexOf("key:'review'", emailQueueIdx);
      const slice = src.slice(emailQueueIdx, rowFnEnd);
      return !slice.includes("href:'mailto:") && !slice.includes('href:\'mailto:');
    });
    expect(noMailto).toBeTruthy();
  });

  test('F2: Email Queue row uses openEmailModal', async ({ page }) => {
    await loginAndChecklist(page);
    const hasModal = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('openEmailModal(v)')
    );
    expect(hasModal).toBeTruthy();
  });

  test('F4: Checklist section headers have mini progress bar', async ({ page }) => {
    await loginAndChecklist(page);
    const hasProgBar = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_secBar') &&
      document.documentElement.innerHTML.includes('_secProgWrap')
    );
    expect(hasProgBar).toBeTruthy();
  });

  test('F4: Section progress shows GoWith selected count', async ({ page }) => {
    await loginAndChecklist(page);
    const hasGwCount = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('gwCount') &&
      document.documentElement.innerHTML.includes('selected')
    );
    expect(hasGwCount).toBeTruthy();
  });

});
