import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
const rows = [];
try {
  for (const [username,password] of [['admin','admin123'],['ceo','ceo123'],['zhangwm','123456'],['wangxp','123456'],['limf','123456'],['zhaoh','123456']]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:9280/#/');
    await page.locator('#lg-user').fill(username);
    await page.locator('#lg-pass').fill(password);
    await page.locator('.btn-primary').click();
    await page.waitForSelector('#page-body');
    await page.waitForLoadState('networkidle');
    const nav = await page.locator('.nav-item').evaluateAll(nodes => nodes.map(n=>n.dataset.route));
    for (const route of nav) {
      await page.goto('http://127.0.0.1:9280/#/' + route);
      await page.reload({waitUntil:'networkidle'});
      const body = await page.locator('#page-body').innerText();
      if (/加载失败|\[object Promise\]/.test(body)) errors.push(route + ': failed rendering');
    }
    rows.push({username, nav, errors});
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('artifacts/accounts-browser-results.json', JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
