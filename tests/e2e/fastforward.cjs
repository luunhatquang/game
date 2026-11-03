// Tua nhanh trận đấu trong trình duyệt, kiểm tra vẽ không lỗi khi AI phát triển và tấn công.
const { chromium } = require('playwright');
const dir = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#start');
  await page.click('#start');
  await page.waitForTimeout(300);
  // Người chơi cho pawn đi khai thác để có kinh tế cơ bản.
  for (let step = 0; step < 18; step++) {
    await page.evaluate(() => { const w = window.rts.world; for (let i = 0; i < 600; i++) w.tick(0.05); });
    await page.waitForTimeout(150);
  }
  const s = await page.evaluate(() => {
    const w = window.rts.world;
    const ai = w.buildings.filter(b => b.owner === 1);
    const c = w.centerOf(ai.find(b => b.type === 'castle') || ai[0]);
    w.fog.enabled = false;
    window.rts.renderer['scene'].cameras.main.setZoom(0.55);
    window.rts.jumpTo(c.x - 200, c.y + 200);
    return { t: Math.round(w.time), aiTypes: [...new Set(ai.map(b => b.type))], aiUnits: w.units.filter(u => u.owner === 1).length, winner: w.winner, humanBuildings: w.buildings.filter(b => b.owner === 0).length };
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: dir + '/ff-ai.png' });
  console.log(JSON.stringify(s));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
