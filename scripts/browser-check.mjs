// Optional: npm install --no-save --package-lock=false playwright
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const errors = [];
try {
  for (const [username, password, expectedTeams] of [['admin', 'admin123', 2], ['limf', '123456', 1]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${username}: ${e.message}`));
    page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${username}: ${r.status()} ${r.url()}`); });
    await page.goto('http://127.0.0.1:9280/#/');
    await page.locator('#lg-user').fill(username);
    await page.locator('#lg-pass').fill(password);
    await page.locator('.btn-primary').click();
    await page.waitForSelector('#page-body');
    assert.equal(await page.locator('#team-select option').count(), expectedTeams > 1 ? expectedTeams : 0);
    for (const route of ['dashboard', 'strategies', 'campaigns', 'plans', 'board', 'meetings', 'cycles', 'rewards', 'warnings', 'org']) {
      await page.goto(`http://127.0.0.1:9280/#/${route}`);
      await page.reload({ waitUntil: 'networkidle' });
      assert.ok(!(await page.locator('#page-body').innerText()).includes('加载失败'), `${username} ${route}`);
      assert.ok(!(await page.locator('#page-body').innerText()).includes('[object Promise]'), `${username} ${route}: unresolved async value`);
      if (username === 'limf' && ['strategies', 'campaigns', 'rewards', 'org'].includes(route)) {
        assert.ok((await page.locator('#page-body').innerText()).includes('无权访问'));
        assert.equal(await page.locator(`.nav-item[data-route="${route}"]`).count(), 0);
      }
    }
    if (username === 'admin') {
      await page.goto('http://127.0.0.1:9280/#/strategies');
      await page.reload({ waitUntil: 'networkidle' });
      assert.ok(await page.getByRole('button', { name: '修改' }).count() > 0);
      assert.ok(await page.getByRole('button', { name: '删除' }).count() > 0);
      await page.getByRole('button', { name: '修改' }).first().click();
      assert.ok((await page.locator('.modal-h').innerText()).includes('修改战略规划'));
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.goto('http://127.0.0.1:9280/#/campaigns');
      await page.reload({ waitUntil: 'networkidle' });
      assert.ok(await page.getByRole('button', { name: '修改' }).count() > 0);
      assert.ok(await page.getByRole('button', { name: '删除' }).count() > 0);
      await page.getByRole('button', { name: '修改' }).first().click();
      assert.ok((await page.locator('.modal-h').innerText()).includes('修改战役'));
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await page.goto('http://127.0.0.1:9280/#/dashboard');
      await page.reload({ waitUntil: 'networkidle' });
      const dashboardText = await page.locator('#page-body').innerText();
      assert.ok(dashboardText.includes('总战役'));
      assert.ok(await page.getByRole('columnheader', { name: '战役', exact: true }).count() > 0);
      await page.locator('#team-select').selectOption('t_2');
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('#team-select').inputValue(), 't_2');
    }
    await page.goto('http://127.0.0.1:9280/#/plans');
    await page.reload({ waitUntil: 'networkidle' });
    const content = await page.locator('#page-body').innerText();
    assert.ok(content.includes('计划分级'));
    assert.ok(content.includes('实际完成时间'));
    assert.ok(content.includes('涂料订单交付验收'));
    assert.ok(!content.includes('明确降本方案落地'));
    assert.ok(content.includes('李明月'));
    if (username === 'admin' || username === 'limf') {
      assert.deepEqual(await page.locator('.level-select').first().locator('option').allTextContents(), ['请选择计划分级', '里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划']);
    }
    await page.getByRole('button', { name: '+ 新建行动计划' }).click();
    assert.ok(await page.locator('#f-campaign option').count() > 0);
    assert.ok(await page.locator('#f-owner-name').count() === 1);
    assert.deepEqual(await page.locator('#f-level option').allTextContents(), ['里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划']);
    assert.deepEqual(await page.locator('#f-level option').evaluateAll(options => options.map(option => option.value)), ['里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划']);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('button', { name: '更新进度' }).first().click();
    assert.equal(await page.locator('#f-completed-at').getAttribute('type'), 'date');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.screenshot({ path: `artifacts/${username}-plans.png`, fullPage: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: both accounts, 20 page visits (including 4 permission-denied views), admin team switch, team-specific plans, no browser/API errors.');
} finally {
  await browser.close();
}
