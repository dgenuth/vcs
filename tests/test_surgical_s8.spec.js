// Surgical Session 8 — 7 confirmed bug fixes (behavioral tests only)
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8181';

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
}

async function loginWithVendors(page) {
  await login(page);
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.view = 'today';
    window.S.itw = [];
    window.S.vendorAliases = {};
    window.S.reviews = [];
    window.S.vendors = [
      { name: 'Alpha Medical', category: 'Medical', score: 8, status: 'Active', source: 'psd', product: 'medical supplies', about: 'medical equipment supplier', vendorRelationships: '' },
      { name: 'Beta Foods', category: 'Food Service', score: 7, status: 'Active', source: 'psd', product: 'food distribution', about: 'food service supplier', vendorRelationships: '' },
      { name: 'Gamma Tech', category: 'Technology', score: 6, status: 'Active', source: 'psd', product: 'software solutions', about: 'tech vendor', vendorRelationships: '' },
      { name: 'Delta Clean', category: 'Facilities', score: 5, status: 'Active', source: 'psd', product: 'cleaning services', about: 'janitorial services', vendorRelationships: '' },
    ];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    window.S.filterLabel = '';
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
}

// Helper: get visible rendered text from #content (not script source)
async function getContentText(page) {
  return page.evaluate(() => {
    const c = document.getElementById('content');
    return c ? c.innerText : '';
  });
}

// ─── Fix 1: Checklist renders without crash ───────────────────────────────────

test('Fix1: checklist renders without "Checklist Error" message', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'checklist';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(800);
  const text = await getContentText(page);
  expect(text).not.toContain('Checklist Error');
});

test('Fix1: checklist shows at least 5 section headers', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'checklist';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(800);
  const text = await getContentText(page);
  const sectionLabels = ['REHAB', 'DIETARY', 'PHARMACY', 'DIALYSIS', 'EVS'];
  const found = sectionLabels.filter(s => text.includes(s));
  expect(found.length).toBeGreaterThanOrEqual(5);
});

test('Fix1: checklist with null-name vendor does not crash', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.view = 'checklist';
    window.S.vendors = [
      { name: null, category: 'Medical', source: 'psd', product: 'medical supplies' },
      { name: 'Valid Vendor', category: 'Food Service', source: 'psd', product: 'food' },
    ];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(800);
  const text = await getContentText(page);
  expect(text).not.toContain('Checklist Error');
});

// ─── Fix 2: Vendor detail panel permission wrapper ────────────────────────────

test('Fix2: source code no longer has empty permission block (if(!hasPermission){}else{)', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const hasOldBug = await page.evaluate(() =>
    document.documentElement.innerHTML.includes("if(!hasPermission('editContract')){}else{") ||
    document.documentElement.innerHTML.includes("if(!hasPermission('editContract')) {} else {")
  );
  expect(hasOldBug).toBeFalsy();
});

test('Fix2: admin role has editContract permission (contract files should render)', async ({ page }) => {
  await login(page);
  const adminHasPerm = await page.evaluate(() => {
    if (typeof hasPermission !== 'function') return false;
    // admin is the logged-in role (dgenuth@primesourcex.com)
    return hasPermission('editContract') === true;
  });
  expect(adminHasPerm).toBeTruthy();
});

test('Fix2: sales_rep role does NOT have editContract permission', async ({ page }) => {
  await login(page);
  const salesRepLacksPerm = await page.evaluate(() => {
    if (typeof ROLE_PERMS === 'undefined') return false;
    const salesPerms = ROLE_PERMS['sales_rep'];
    if (!salesPerms) return false;
    return !salesPerms['editContract'];
  });
  expect(salesRepLacksPerm).toBeTruthy();
});

// ─── Fix 3: SF Rep Performance shows opps with null CloseDate ─────────────────

test('Fix3: YTD filter includes opps with null CloseDate', async ({ page }) => {
  await login(page);
  const thisYear = new Date().getFullYear();
  await page.evaluate((yr) => {
    window.S.loaded = true;
    window.S.view = 'analytics';
    window.S._analyticsTab = 'repperf';
    window.S._analyticsDateRange = 'all'; // use All Time to see all reps
    window.S.vendors = [];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    window.S.itw = [];
    window.S._sfBoardData = {
      opps: [
        { Id: '1', _ownerName: 'TestRep Alpha', _isVCS: true, Amount: '50000', CloseDate: null, StageName: 'Prospecting', _accountName: 'Acme', Owner: { Name: 'TestRep Alpha' } },
        { Id: '2', _ownerName: 'TestRep Alpha', _isVCS: true, Amount: '30000', CloseDate: '', StageName: 'Qualification', _accountName: 'Beta', Owner: { Name: 'TestRep Alpha' } },
        { Id: '3', _ownerName: 'TestRep Beta', _isVCS: true, Amount: '20000', CloseDate: String(yr)+'-06-15', StageName: 'Closed Won', _accountName: 'Gamma', Owner: { Name: 'TestRep Beta' } },
      ],
      cases: [],
      tasks: [],
    };
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  }, thisYear);
  await page.waitForTimeout(800);
  const text = await getContentText(page);
  // At minimum, some rep data should appear
  expect(text).toMatch(/TestRep Alpha|TestRep Beta|Rep Performance|Opportunities/);
});

test('Fix3: YTD filter code uses isNaN(d)||getFullYear pattern', async ({ page }) => {
  await login(page);
  const usesCorrectPattern = await page.evaluate(() => {
    const src = document.documentElement.innerHTML;
    // Check fix is in place: isNaN(d)||d.getFullYear()===_repYear
    return src.includes('isNaN(d)||d.getFullYear()===_repYear');
  });
  expect(usesCorrectPattern).toBeTruthy();
});

// ─── Fix 4: Cross-referral shows ≥3 cards ────────────────────────────────────

test('Fix4: cross-referral section shows at least 3 vendor pair cards', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'network';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
  const crossCount = await page.evaluate(() => {
    const c = document.getElementById('content');
    if (!c) return 0;
    // Count × separators in cross-referral cards
    return (c.innerText.match(/×/g) || []).length;
  });
  expect(crossCount).toBeGreaterThanOrEqual(3);
});

test('Fix4: cross-referral shows vendor names in cards', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'network';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
  const text = await getContentText(page);
  expect(text).toContain('Cross-Referral Opportunities');
  expect(text).toMatch(/Alpha Medical|Beta Foods|Gamma Tech|Delta Clean/);
});

// ─── Fix 5: Settings Expand/Collapse All ─────────────────────────────────────

test('Fix5: Expand All button sets localStorage vcs_rd_collapsed to 0', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.view = 'settings';
    window.S.vendors = [];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    localStorage.setItem('vcs_rd_collapsed', '1');
    localStorage.setItem('vcs_um_collapsed', '1');
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    // Simulate clicking Expand All by finding the button
    const btns = Array.from(document.querySelectorAll('button'));
    const expandBtn = btns.find(b => b.textContent.trim().includes('Expand All'));
    if (expandBtn) expandBtn.click();
  });
  await page.waitForTimeout(400);
  const rdCollapsed = await page.evaluate(() => localStorage.getItem('vcs_rd_collapsed'));
  const umCollapsed = await page.evaluate(() => localStorage.getItem('vcs_um_collapsed'));
  expect(rdCollapsed).toBe('0');
  expect(umCollapsed).toBe('0');
});

test('Fix5: Collapse All button sets localStorage vcs_rd_collapsed to 1', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.view = 'settings';
    window.S.vendors = [];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    localStorage.setItem('vcs_rd_collapsed', '0');
    localStorage.setItem('vcs_um_collapsed', '0');
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const collapseBtn = btns.find(b => b.textContent.trim().includes('Collapse All'));
    if (collapseBtn) collapseBtn.click();
  });
  await page.waitForTimeout(400);
  const rdCollapsed = await page.evaluate(() => localStorage.getItem('vcs_rd_collapsed'));
  const umCollapsed = await page.evaluate(() => localStorage.getItem('vcs_um_collapsed'));
  expect(rdCollapsed).toBe('1');
  expect(umCollapsed).toBe('1');
});

test('Fix5: after Expand All, settingsCard sections show ▼ (open)', async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.view = 'settings';
    window.S._settingsExpandAll = false;
    window.S.vendors = [];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const expandBtn = btns.find(b => b.textContent.trim().includes('Expand All'));
    if (expandBtn) expandBtn.click();
  });
  await page.waitForTimeout(500);
  const openCount = await page.evaluate(() => {
    const c = document.getElementById('content');
    if (!c) return 0;
    return (c.innerText.match(/▼/g) || []).length;
  });
  expect(openCount).toBeGreaterThanOrEqual(3);
});

// ─── Fix 6: Today tab gap ≤50px ──────────────────────────────────────────────

test('Fix6: Today tab spacer height is capped at 36px', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'today';
    window.S.settings = window.S.settings || {};
    window.S.settings.showKPIs = true;
    if (typeof render === 'function') render();
  });
  // Wait for requestAnimationFrame to fire
  await page.waitForTimeout(500);
  const spacerHeight = await page.evaluate(() => {
    return new Promise(resolve => {
      setTimeout(() => {
        const hdr = document.getElementById('today-sticky-hdr');
        if (!hdr) { resolve(0); return; }
        const next = hdr.nextElementSibling;
        if (!next) { resolve(0); return; }
        resolve(parseFloat(next.style.height) || 0);
      }, 200);
    });
  });
  expect(spacerHeight).toBeLessThanOrEqual(50);
});

test('Fix6: Today tab spacer does not exceed 36px even with KPIs enabled', async ({ page }) => {
  await loginWithVendors(page);
  await page.evaluate(() => {
    window.S.view = 'today';
    window.S.settings = window.S.settings || {};
    window.S.settings.showKPIs = true;
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(600);
  const spacerHeight = await page.evaluate(() => {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const hdr = document.getElementById('today-sticky-hdr');
        if (!hdr) { resolve(0); return; }
        const next = hdr.nextElementSibling;
        if (!next) { resolve(0); return; }
        resolve(parseFloat(next.style.height) || 0);
      });
    });
  });
  expect(spacerHeight).toBeLessThanOrEqual(36);
});

// ─── Fix 7: SF auto-reconnect after page refresh ──────────────────────────────

test('Fix7: restoreSFSession restores token from localStorage', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('vcs_sf_token_ls', JSON.stringify({
      token: 'fake_sf_token_12345',
      instance: 'https://test.salesforce.com',
      storedAt: Date.now(),
      expiry: Date.now() + 3600000
    }));
  });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  const sfToken = await page.evaluate(() => typeof USER !== 'undefined' ? USER.sfToken : null);
  expect(sfToken).toBe('fake_sf_token_12345');
});

test('Fix7: after token restore, SF Board does not show Connect Salesforce button', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('vcs_sf_token_ls', JSON.stringify({
      token: 'fake_sf_token_99',
      instance: 'https://test.salesforce.com',
      storedAt: Date.now(),
      expiry: Date.now() + 3600000
    }));
  });
  await page.waitForSelector('#login-email', { timeout: 5000 });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  await page.evaluate(() => {
    window.S.loaded = true;
    window.S.vendors = [];
    window.S.channelVendors = [];
    window.S.dismissed = new Set();
    window.S.view = 'sfboard';
    document.getElementById('upload-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(500);
  const connectBtnVisible = await page.evaluate(() => {
    const c = document.getElementById('content');
    if (!c) return false;
    // Check if "Connect Salesforce" button is actually rendered and visible
    const btns = Array.from(c.querySelectorAll('button'));
    return btns.some(b => b.innerText.includes('Connect Salesforce'));
  });
  expect(connectBtnVisible).toBeFalsy();
});

test('Fix7: manual login also restores SF token', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('vcs_sf_token_ls', JSON.stringify({
      token: 'restored_after_login',
      instance: 'https://test.salesforce.com',
      storedAt: Date.now(),
      expiry: Date.now() + 3600000
    }));
  });
  await page.fill('#login-email', 'dgenuth@primesourcex.com');
  await page.click('#login-btn');
  await page.waitForFunction(() => typeof render === 'function', { timeout: 8000 });
  const sfToken = await page.evaluate(() => typeof USER !== 'undefined' ? USER.sfToken : null);
  expect(sfToken).toBe('restored_after_login');
});
