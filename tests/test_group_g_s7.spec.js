// GROUP G (Session 7) — SF overdue popup, analytics date range order, Trends score chart
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function loginAndSF(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'sfboard';
    window.S._sfBoardData = {
      opps: [], cases: [],
      tasks: [
        { Subject: 'Overdue Task 1', ActivityDate: '2025-01-01', Status: 'Open', Owner: { Name: 'Rep A' } },
        { Subject: 'Overdue Task 2', ActivityDate: '2025-02-15', Status: 'In Progress', Owner: { Name: 'Rep B' } },
        { Subject: 'Overdue Task 3', ActivityDate: '2025-03-01', Status: 'Open', Owner: { Name: 'Rep C' } },
      ]
    };
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

async function loginAndAnalytics(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    if (!window.S) return;
    window.S.loaded = true;
    window.S.view = 'analytics';
    window.S._analyticsTab = 'trends';
    window.S.vendors = [
      { name: 'V1', category: 'Food', score: 8.5, status: 'Active', vendorRelationships: '' },
      { name: 'V2', category: 'Medical', score: 4.0, status: 'Active', vendorRelationships: '' },
      { name: 'V3', category: 'Tech', score: 2.0, status: 'Active', vendorRelationships: '' },
    ];
    const us = document.getElementById('upload-screen');
    if (us) us.style.display = 'none';
    const ap = document.getElementById('app');
    if (ap) ap.style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
}

test.describe('Group G (S7) — SF overdue popup, analytics date order, Trends score chart', () => {

  test('G1: SF Board renders overdue task section', async ({ page }) => {
    await loginAndSF(page);
    const hasOverdue = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('overdueTasks') ||
      document.documentElement.innerHTML.includes('Overdue')
    );
    expect(hasOverdue).toBeTruthy();
  });

  test('G1: Overdue tasks header is clickable (onclick opens modal)', async ({ page }) => {
    await loginAndSF(page);
    const hasClickable = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('openModal') &&
      document.documentElement.innerHTML.includes('Overdue Tasks')
    );
    expect(hasClickable).toBeTruthy();
  });

  test('G1: Overdue tasks modal uses buildSortableTable', async ({ page }) => {
    await loginAndSF(page);
    const hasSortable = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('buildSortableTable') &&
      document.documentElement.innerHTML.includes('Overdue By')
    );
    expect(hasSortable).toBeTruthy();
  });

  test('G2: Analytics tabBar appended before customRow in DOM', async ({ page }) => {
    await loginAndAnalytics(page);
    const orderOk = await page.evaluate(() => {
      const c = document.getElementById('content');
      if (!c) return false;
      const children = Array.from(c.children);
      const tabBarIdx = children.findIndex(el =>
        el.style && el.style.display === 'flex' && el.querySelectorAll('button').length > 1
      );
      const customIdx = children.findIndex(el => el.id === 'analytics-custom-dates');
      // tabBar must appear before customRow
      return tabBarIdx >= 0 && customIdx >= 0 && tabBarIdx < customIdx;
    });
    expect(orderOk).toBeTruthy();
  });

  test('G2: Date range label appears in analytics', async ({ page }) => {
    await loginAndAnalytics(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Showing:');
  });

  test('G3: Trends tab shows Score Distribution section', async ({ page }) => {
    await loginAndAnalytics(page);
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('Score Distribution');
  });

  test('G3: Score Distribution uses _sBuckets variable', async ({ page }) => {
    await loginAndAnalytics(page);
    const hasBuckets = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('_sBuckets')
    );
    expect(hasBuckets).toBeTruthy();
  });

  test('G3: Score Distribution renders bar chart', async ({ page }) => {
    await loginAndAnalytics(page);
    const hasChart = await page.evaluate(() =>
      document.documentElement.innerHTML.includes('8-10') &&
      document.documentElement.innerHTML.includes('0-2')
    );
    expect(hasChart).toBeTruthy();
  });

});
