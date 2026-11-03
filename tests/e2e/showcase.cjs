// Chụp cảnh trưng bày mọi công trình + đơn vị (Thời đại 2) để kiểm tra hình ảnh. node tests/e2e/showcase.cjs <out.png>
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
  await page.evaluate(() => {
    const w = window.rts.world;
    w.ai = [];
    w.players[0].age = 2;
    const castle = w.buildings.find(b => b.owner === 0);
    // Dọn một khoảng đất phía trên nhà chính để đặt công trình.
    const x0 = castle.tx - 6, y0 = castle.ty - 13;
    for (const n of w.nodes.slice()) if (n.tx >= x0 && n.tx < x0 + 18 && n.ty >= y0 && n.ty < y0 + 12) w.removeEntity(n);
    for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 18; x++) if (w.map.inBounds(x, y)) { w.map.terrain[w.map.idx(x, y)] = 0; w.map.solid[w.map.idx(x, y)] = 0; }
    const list = [['house', 0, 0], ['lumberCamp', 3, 0], ['miningCamp', 6, 0], ['mill', 9, 0], ['farm', 12, 0], ['barracks', 0, 4], ['archery', 4, 4], ['stable', 8, 4], ['tower', 12, 4]];
    for (const [t, dx, dy] of list) w.placeBuilding(t, 0, x0 + dx, y0 + dy, true);
    const site = w.placeBuilding('house', 0, x0 + 15, y0, false); site.progress = 9;
    const dmg = w.buildings.find(b => b.type === 'barracks'); dmg.hp = dmg.maxHp * 0.3;
    ['pawn', 'infantry', 'archer', 'cavalry'].forEach((t, i) => w.spawnUnit(t, 0, (x0 + 1 + i * 1.5) * 64, (y0 + 9) * 64));
    ['pawn', 'infantry', 'archer', 'cavalry'].forEach((t, i) => w.spawnUnit(t, 1, (x0 + 9 + i * 1.5) * 64, (y0 + 9.5) * 64));
    w.fog.enabled = false;
    window.rts.renderer['scene'].cameras.main.setZoom(0.75);
    window.rts.jumpTo((x0 + 9) * 64, (y0 + 6) * 64);
    window.rts.rts.setSelection(w.units.filter(u => u.owner === 0).map(u => u.id));
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: process.argv[2] });
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})();
