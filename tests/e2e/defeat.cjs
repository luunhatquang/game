const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#start');
  await page.click('#start');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const w = window.rts.world; for (const b of w.buildings.filter(b => b.owner === 0)) w.removeEntity(b); });
  await page.waitForTimeout(1500);
  const title = await page.$eval('#screen h2', el => el.textContent).catch(() => '');
  console.log(title === 'Thất bại' ? 'PASS  Hiện màn hình thất bại' : 'FAIL  ' + title);
  await page.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
