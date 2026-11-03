// Kiểm thử giao diện trên trình duyệt thật. Cần dev server ở :8080. node tests/e2e/ui.cjs <outdir>
const { chromium } = require('playwright');
const dir = process.argv[2] || '.';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#start');
  await page.screenshot({ path: dir + '/u0-start.png' });
  await page.click('[data-d="hard"]');
  await page.click('#start');
  await page.waitForTimeout(500);
  const W = fn => page.evaluate(fn);
  const toScreen = (x, y) => page.evaluate(([x, y]) => {
    const cam = window.rts.renderer['scene'].cameras.main; const v = cam.worldView;
    return { x: (x - v.x) * cam.zoom, y: (y - v.y) * cam.zoom };
  }, [x, y]);
  check('Độ khó Khó được áp dụng', await W(() => window.rts.world.players[1].difficulty) === 'hard');

  // Chọn nhà chính bằng chuột, sinh pawn bằng nút, huỷ bằng hàng đợi.
  const castle = await W(() => { const b = window.rts.world.buildings.find(b => b.owner === 0); const c = window.rts.world.centerOf(b); return c; });
  let p = await toScreen(castle.x, castle.y);
  await page.mouse.click(p.x, p.y);
  check('Bấm chọn nhà chính', await W(() => [...window.rts.rts.selection].map(id => window.rts.world.get(id).type).join()) === 'castle');
  const food0 = await W(() => window.rts.world.players[0].resources.food);
  await page.click('[data-btn="train-pawn"]');
  await page.click('[data-btn="train-pawn"]');
  await page.waitForTimeout(400);
  check('Nút sinh pawn trừ thức ăn', await W(() => window.rts.world.players[0].resources.food) === food0 - 100);
  await W(() => { window.rts.world.players[0].resources.food -= 70; });
  await page.waitForTimeout(300);
  await page.click('[data-btn="train-pawn"]');
  await page.waitForTimeout(300);
  const msgs = await page.$$eval('.msg', els => els.map(e => e.textContent));
  check('Không đủ thức ăn: nút mờ + thông báo', msgs.some(m => /Không đủ tài nguyên/.test(m)), msgs.join(' | '));
  check('Nút sinh pawn hiển thị mờ', await page.$eval('[data-btn="train-pawn"]', el => el.classList.contains('disabled')));
  await page.screenshot({ path: dir + '/u1-queue.png' });
  await page.click('.qitem[data-cancel="1"]');
  await page.waitForTimeout(250);
  await page.click('.qitem[data-cancel="0"]');
  await page.waitForTimeout(250);
  check('Huỷ hàng đợi qua UI hoàn thức ăn', await W(() => window.rts.world.players[0].resources.food) === food0 - 70);
  await W(() => { window.rts.world.players[0].resources.food += 70; });

  // Rally point bằng chuột phải.
  p = await toScreen(castle.x + 300, castle.y - 200);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  check('Đặt rally point bằng chuột phải', await W(() => !!window.rts.world.buildings.find(b => b.owner === 0).rally));

  // Chọn 1 pawn, đặt Nhà dân, Delete để huỷ.
  const pawn = await W(() => { const u = window.rts.world.units.find(u => u.owner === 0); return { x: u.x, y: u.y, id: u.id }; });
  p = await toScreen(pawn.x, pawn.y - 14);
  await page.mouse.click(p.x, p.y);
  check('Bấm chọn 1 pawn', await W(() => window.rts.rts.selection.size) === 1);
  const wood0 = await W(() => window.rts.world.players[0].resources.wood);
  await page.click('[data-btn="build-house"]');
  // Thử đặt ở vài chỗ đến khi được.
  let placed = false;
  for (const [dx, dy] of [[-250, -60], [-250, 60], [250, -150], [0, -250]]) {
    p = await toScreen(pawn.x + dx, pawn.y + dy);
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(80);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
    if (await W(() => window.rts.world.buildings.some(b => b.owner === 0 && b.type === 'house'))) { placed = true; break; }
    await page.click('[data-btn="build-house"]');
  }
  check('Đặt Nhà dân bằng chuột', placed && await W(() => window.rts.world.players[0].resources.wood) === wood0 - 30);
  const house = await W(() => { const b = window.rts.world.buildings.find(b => b.owner === 0 && b.type === 'house'); return window.rts.world.centerOf(b); });
  p = await toScreen(house.x, house.y);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  check('Delete huỷ công trình, hoàn gỗ', await W(() => window.rts.world.players[0].resources.wood) === wood0 && await W(() => !window.rts.world.buildings.some(b => b.type === 'house' && b.owner === 0)));

  // Nhóm: chọn pawn, Ctrl+1, Esc, phím 1.
  const pawnNow = await W(() => { const u = window.rts.world.units.find(u => u.owner === 0 && !u.moving); return { x: u.x, y: u.y }; });
  p = await toScreen(pawnNow.x, pawnNow.y - 14);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Control+Digit1');
  await page.keyboard.press('Escape');
  check('Esc bỏ chọn', await W(() => window.rts.rts.selection.size) === 0);
  await page.keyboard.press('Digit1');
  check('Ctrl+1 / 1 gọi lại nhóm', await W(() => window.rts.rts.selection.size) === 1);
  await page.click('#btn-idle');
  check('Nút tìm pawn rảnh chọn 1 pawn', await W(() => { const s = [...window.rts.rts.selection]; return s.length === 1 && window.rts.world.get(s[0]).type === 'pawn' && !window.rts.world.get(s[0]).order; }));

  // Minimap di chuyển camera.
  const cam0 = await W(() => window.rts.renderer['scene'].cameras.main.worldView.centerX);
  const mm = await page.$eval('#minimap', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.25 }; });
  await page.mouse.click(mm.x, mm.y);
  const cam1 = await W(() => window.rts.renderer['scene'].cameras.main.worldView.centerX);
  check('Bấm minimap di chuyển camera', cam1 > cam0 + 1000, `${Math.round(cam0)} -> ${Math.round(cam1)}`);
  // Phím camera.
  await page.keyboard.down('KeyA'); await page.waitForTimeout(400); await page.keyboard.up('KeyA');
  const cam2 = await W(() => window.rts.renderer['scene'].cameras.main.worldView.centerX);
  check('Phím A cuộn camera', cam2 < cam1 - 50, `${Math.round(cam1)} -> ${Math.round(cam2)}`);

  // Cuộn camera khi đưa chuột ra mép phải.
  const camE = await W(() => window.rts.renderer['scene'].cameras.main.worldView.centerX);
  await page.mouse.move(1399, 400);
  await page.waitForTimeout(500);
  await page.mouse.move(700, 400);
  const camF = await W(() => window.rts.renderer['scene'].cameras.main.worldView.centerX);
  check('Đưa chuột ra mép màn hình cuộn camera', camF > camE + 50, `${Math.round(camE)} -> ${Math.round(camF)}`);

  // Lưu / tải.
  await page.click('#btn-menu');
  check('Menu tạm dừng game', await W(() => window.rts.paused));
  const t0 = await W(() => window.rts.world.time);
  await page.waitForTimeout(500);
  check('Thời gian đứng yên khi tạm dừng', await W(() => window.rts.world.time) === t0);
  await page.click('#save');
  const n0 = await W(() => window.rts.world.entities.size);
  await page.click('#resume');
  await page.waitForTimeout(1500);
  await page.click('#btn-menu');
  const tBefore = await W(() => window.rts.world.time);
  await page.click('#load');
  await page.waitForTimeout(100);
  const after = await W(() => ({ t: window.rts.world.time, n: window.rts.world.entities.size }));
  check('Tải trận khôi phục trạng thái đã lưu', after.t < tBefore - 1 && Math.abs(after.n - n0) <= 1, `lưu lúc ${t0.toFixed(1)}s, trước khi tải ${tBefore.toFixed(1)}s, sau khi tải ${after.t.toFixed(1)}s, thực thể ${n0}->${after.n}`);

  // Hiệu năng: 120 đơn vị đánh nhau trên màn hình.
  await W(() => {
    const w = window.rts.world; const c = w.centerOf(w.buildings.find(b => b.owner === 0));
    const types = ['infantry', 'archer', 'cavalry'];
    for (let i = 0; i < 120; i++) {
      const owner = i % 2; const tx = Math.floor(c.x / 64) + 4 + (i % 10) - (owner ? 0 : 6); const ty = Math.floor(c.y / 64) - 8 - Math.floor(i / 20);
      const p = w.map.nearestOpen(tx + (owner ? 6 : 0), ty);
      w.spawnUnit(types[i % 3], owner, p.x * 64 + 32, p.y * 64 + 32);
    }
    w.fog.enabled = false;
    window.rts.jumpTo(c.x + 200, c.y - 500);
  });
  const perf = await W(() => new Promise(res => {
    const ctl = window.rts; const orig = ctl.update.bind(ctl); let total = 0, n = 0, max = 0;
    ctl.update = d => { const t = performance.now(); orig(d); const e = performance.now() - t; total += e; max = Math.max(max, e); n++; };
    setTimeout(() => { ctl.update = orig; res({ avg: total / n, max, frames: n, units: ctl.world.units.length, fps: ctl.renderer['scene'].game.loop.actualFps }); }, 5000);
  }));
  check('Logic + đồng bộ vẽ mỗi frame < 6ms với >100 đơn vị', perf.avg < 6, JSON.stringify(perf));
  await page.screenshot({ path: dir + '/u2-battle.png' });
  await W(() => { window.rts.world.fog.enabled = true; });

  // Thắng: phá hết công trình địch.
  await W(() => { const w = window.rts.world; for (const b of w.buildings.filter(b => b.owner === 1)) { b.hp = 1; } });
  await W(() => { const w = window.rts.world; for (const b of w.buildings.filter(b => b.owner === 1)) w.removeEntity(b); });
  await page.waitForTimeout(1500);
  const title = await page.$eval('#screen h2', el => el.textContent).catch(() => '');
  check('Hiện màn hình chiến thắng', title === 'Chiến thắng!', title);
  await page.screenshot({ path: dir + '/u3-win.png' });
  await page.click('#again');
  await page.waitForSelector('#start');
  check('Về màn hình chính', true);
  check('Không có lỗi console', errors.length === 0, errors.join(' | '));
  console.log(failed ? `${failed} FAIL` : 'UI: tất cả đạt');
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
