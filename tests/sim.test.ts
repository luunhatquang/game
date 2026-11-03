// Kiểm thử mô phỏng headless. Chạy: node tests/run.mjs tests/sim.test.ts
import { BUILDINGS, ECONOMY, NODES, NodeType, ResourceType, UNITS } from '../src/game/config/balance';
import { cancelQueue, commandAttack, commandGather, commandMove, deleteEntity, placeBuilding, train } from '../src/game/sim/commands';
import { GameMap } from '../src/game/sim/GameMap';
import { createWorld } from '../src/game/sim/mapgen';
import { deserialize, serialize } from '../src/game/sim/save';
import { kill } from '../src/game/sim/systems/combat';
import { AI_PLAYER, Building, HUMAN, Unit } from '../src/game/sim/types';
import { World } from '../src/game/sim/World';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) failed++;
}

function run(w: World, seconds: number, dt = 0.05): void {
    for (let t = 0; t < seconds; t += dt) w.tick(dt);
}

/** World không có AI để kiểm thử từng tính năng. */
function quietWorld(seed = 7): World {
    const w = createWorld('normal', seed);
    w.ai = [];
    return w;
}

const castleOf = (w: World, owner: number) => w.buildings.find(b => b.owner === owner && b.type === 'castle')!;
const pawnsOf = (w: World, owner: number) => w.units.filter(u => u.owner === owner && u.type === 'pawn');

function nearestNode(w: World, type: NodeType, x: number, y: number) {
    return w.nodes.filter(n => n.type === type).sort((a, b) =>
        Math.hypot(a.tx * 64 - x, a.ty * 64 - y) - Math.hypot(b.tx * 64 - x, b.ty * 64 - y))[0];
}

// ---------- 1. Khai thác đủ 4 loại tài nguyên ----------
{
    const w = quietWorld();
    const c = w.centerOf(castleOf(w, HUMAN));
    const pawns = pawnsOf(w, HUMAN);
    const types: [NodeType, ResourceType][] = [['tree', 'wood'], ['sheep', 'food'], ['gold', 'gold'], ['stone', 'stone']];
    const before = { ...w.players[HUMAN].resources };
    const nodeTotal = (res: ResourceType) => w.nodes.filter(n => NODES[n.type].resource === res).reduce((s, n) => s + n.amount, 0);
    const totals0 = Object.fromEntries(types.map(([, r]) => [r, nodeTotal(r)]));
    types.forEach(([t], i) => commandGather(w, HUMAN, [pawns[i].id], nearestNode(w, t, c.x, c.y).id));
    run(w, 150);
    for (const [, r] of types) {
        const p = pawns.find(u => (u.order?.type === 'gather') && (u.carryType === r || w.players[HUMAN].resources[r] > before[r]));
        const gained = w.players[HUMAN].resources[r] - before[r];
        const carried = pawns.filter(u => u.carryType === r).reduce((s, u) => s + u.carry, 0);
        const taken = totals0[r] - nodeTotal(r);
        check(`Khai thác ${r}: kho tăng theo bội số ${ECONOMY.carryCapacity}`, gained > 0 && gained % ECONOMY.carryCapacity === 0, `+${gained}`);
        check(`Khai thác ${r}: lượng lấy từ nguồn = vào kho + đang mang`, Math.abs(taken - gained - carried) < 0.5, `nguồn -${taken.toFixed(1)}, kho +${gained}, mang ${carried.toFixed(1)}`);
        void p;
    }
}

// ---------- 1a. Trên nhiều bản đồ ngẫu nhiên, pawn đều khai thác được 4 loại ----------
for (let seed = 1; seed <= 6; seed++) {
    const w = createWorld('normal', seed * 7919);
    w.ai = [];
    const c = w.centerOf(castleOf(w, HUMAN));
    const pawns = pawnsOf(w, HUMAN);
    const types: NodeType[] = ['tree', 'berry', 'gold', 'stone'];
    types.forEach((t, i) => commandGather(w, HUMAN, [pawns[i].id], nearestNode(w, t, c.x, c.y).id));
    const r0 = { ...w.players[HUMAN].resources };
    run(w, 120);
    const r = w.players[HUMAN].resources;
    const ok = (['wood', 'food', 'gold', 'stone'] as const).every(k => r[k] > r0[k]);
    check(`Bản đồ seed ${seed * 7919}: khai thác đủ 4 loại`, ok, JSON.stringify(r));
}

// ---------- 1b. Nguồn cạn: tự tìm nguồn cùng loại, hết thì rảnh ----------
{
    const w = quietWorld();
    const pawn = pawnsOf(w, HUMAN)[0];
    const tree = nearestNode(w, 'tree', pawn.x, pawn.y);
    tree.amount = 5;
    commandGather(w, HUMAN, [pawn.id], tree.id);
    run(w, 25);
    check('Nguồn cạn thì biến mất', !w.entities.has(tree.id));
    const t = pawn.order?.type === 'gather' ? w.get(pawn.order.target) : null;
    check('Pawn tự chuyển sang cây gần nhất', !!t && t.kind === 'node' && t.type === 'tree', `order=${JSON.stringify(pawn.order)}`);
    // Không còn sheep nào: pawn đứng rảnh.
    const w2 = quietWorld();
    const p2 = pawnsOf(w2, HUMAN)[0];
    for (const n of w2.nodes.slice()) if (NODES[n.type].resource === 'food' && n.type !== 'sheep') w2.removeEntity(n);
    const sheep = w2.nodes.filter(n => n.type === 'sheep');
    for (const s of sheep.slice(1)) w2.removeEntity(s);
    sheep[0].amount = 4;
    commandGather(w2, HUMAN, [p2.id], sheep[0].id);
    run(w2, 40);
    check('Hết nguồn cùng loại thì pawn rảnh', p2.order === null && p2.state === 'idle', `state=${p2.state}`);
}

// ---------- 2. Không đủ tài nguyên ----------
{
    const w = quietWorld();
    w.players[HUMAN].resources = { wood: 10, food: 10, gold: 0, stone: 0 };
    const pawn = pawnsOf(w, HUMAN)[0];
    const castle = castleOf(w, HUMAN);
    const r1 = placeBuilding(w, HUMAN, 'barracks', castle.tx - 6, castle.ty - 6, [pawn.id]);
    check('Không đủ gỗ thì không xây được', !r1.ok && /Không đủ tài nguyên/.test(r1.msg ?? ''), r1.msg);
    const r2 = train(w, HUMAN, castle.id, 'pawn');
    check('Không đủ thức ăn thì không sinh được', !r2.ok && /thiếu 40 thức ăn/.test(r2.msg ?? ''), r2.msg);
    const msgs = w.drainEvents().filter(e => e.type === 'message');
    check('Có thông báo cho người chơi', msgs.length >= 2);
}

// ---------- 3. Huỷ xây / huỷ hàng đợi hoàn tài nguyên ----------
{
    const w = quietWorld();
    const res0 = { ...w.players[HUMAN].resources };
    const pawn = pawnsOf(w, HUMAN)[0];
    const castle = castleOf(w, HUMAN);
    let placed: Building | undefined;
    for (let dy = -8; dy <= 8 && !placed; dy++) {
        for (let dx = -8; dx <= 8 && !placed; dx++) {
            const r = placeBuilding(w, HUMAN, 'lumberCamp', castle.tx + dx, castle.ty + dy, [pawn.id]);
            if (r.ok) placed = r.building;
        }
    }
    check('Đặt công trình trừ tài nguyên ngay', !!placed && w.players[HUMAN].resources.wood === res0.wood - 100);
    run(w, 3);
    deleteEntity(w, HUMAN, placed!.id);
    check('Huỷ công trình đang xây hoàn lại đủ', w.players[HUMAN].resources.wood === res0.wood, `wood=${w.players[HUMAN].resources.wood}`);
    check('Công trình huỷ giải phóng ô', w.map.isFree(placed!.tx, placed!.ty));
    w.players[HUMAN].resources.food = 200;
    const f0 = w.players[HUMAN].resources.food;
    train(w, HUMAN, castle.id, 'pawn'); train(w, HUMAN, castle.id, 'pawn'); train(w, HUMAN, castle.id, 'pawn');
    check('Thêm 3 pawn vào hàng đợi trừ 150 thức ăn', w.players[HUMAN].resources.food === f0 - 150);
    run(w, 2);
    cancelQueue(w, HUMAN, castle.id, 2); cancelQueue(w, HUMAN, castle.id, 0); cancelQueue(w, HUMAN, castle.id, 0);
    check('Huỷ hàng đợi hoàn lại đủ', w.players[HUMAN].resources.food === f0 && castle.queue.length === 0, `food=${w.players[HUMAN].resources.food}`);
    w.players[HUMAN].resources.food = 1000;
    for (let i = 0; i < 6; i++) train(w, HUMAN, castle.id, 'pawn');
    check('Hàng đợi tối đa 5', castle.queue.length === 5);
}

// ---------- 4. Giới hạn dân ----------
{
    const w = quietWorld();
    const p = w.players[HUMAN];
    p.resources = { wood: 1000, food: 1000, gold: 1000, stone: 1000 };
    const castle = castleOf(w, HUMAN);
    for (let i = 0; i < 5; i++) train(w, HUMAN, castle.id, 'pawn');
    run(w, 5 * UNITS.pawn.trainTime + 30);
    w.updatePopulation();
    check('Sinh xong 5 pawn trong hàng đợi (9/10)', p.pop === 9 && castle.queue.length === 0, `pop=${p.pop}/${p.popCap}`);
    train(w, HUMAN, castle.id, 'pawn');
    train(w, HUMAN, castle.id, 'pawn');
    run(w, UNITS.pawn.trainTime * 3);
    w.updatePopulation();
    const r = train(w, HUMAN, castle.id, 'pawn');
    check('Đủ dân thì không thêm vào hàng đợi được', !r.ok && /Đã đủ dân/.test(r.msg ?? ''), r.msg);
    check('Mục trong hàng đợi bị dừng khi đủ dân', p.pop === 10 && castle.queue.length === 1 && castle.queueBlocked, `pop=${p.pop} queue=${castle.queue.length}`);
    const pawn = pawnsOf(w, HUMAN)[0];
    let house: Building | undefined;
    for (let dy = -9; dy <= 9 && !house; dy++) for (let dx = -9; dx <= 9 && !house; dx++) {
        const res = placeBuilding(w, HUMAN, 'house', castle.tx + dx, castle.ty + dy, [pawn.id]);
        if (res.ok) house = res.building;
    }
    run(w, BUILDINGS.house.buildTime + UNITS.pawn.trainTime + 15);
    w.updatePopulation();
    check('Xây nhà dân thì sinh tiếp', house!.built && p.popCap === 15 && p.pop === 11 && castle.queue.length === 0, `pop=${p.pop}/${p.popCap}`);
}

// ---------- 5. Nhóm 20 đơn vị di chuyển không kẹt ----------
{
    const w = quietWorld(11);
    const c = w.centerOf(castleOf(w, HUMAN));
    // Đặt 20 lính trên các ô đi được liền kề, loang từ cạnh nhà chính.
    const ids: number[] = [];
    const start = w.map.nearestOpen(GameMap.toTile(c.x), GameMap.toTile(c.y) - 3)!;
    const seen = new Set([start.y * 1000 + start.x]);
    const q = [start];
    while (ids.length < 20 && q.length) {
        const p = q.shift()!;
        ids.push(w.spawnUnit('infantry', HUMAN, GameMap.center(p.x), GameMap.center(p.y)).id);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
            const n = { x: p.x + dx, y: p.y + dy };
            if (!w.map.isSolid(n.x, n.y) && !seen.has(n.y * 1000 + n.x)) { seen.add(n.y * 1000 + n.x); q.push(n); }
        }
    }
    const target = w.map.nearestOpen(Math.floor(w.map.width / 2), Math.floor(w.map.height / 2))!;
    const tx = GameMap.center(target.x), ty = GameMap.center(target.y);
    commandMove(w, HUMAN, ids, tx, ty);
    let t = 0;
    const units = ids.map(id => w.get(id) as Unit);
    while (t < 60 && units.some(u => u.order)) { w.tick(0.05); t += 0.05; }
    const far = units.filter(u => Math.hypot(u.x - tx, u.y - ty) > 5 * 64);
    const inSolid = units.filter(u => w.map.isSolid(GameMap.toTile(u.x), GameMap.toTile(u.y)));
    check('20 đơn vị tới nơi (không kẹt)', units.every(u => !u.order) && far.length === 0, `t=${t.toFixed(1)}s, xa=${far.length}`);
    check('Không đơn vị nào đứng trong ô bị chặn', inSolid.length === 0);
    let overlaps = 0;
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
        if (Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y) < 10) overlaps++;
    }
    check('Đơn vị dừng quanh điểm đến, không dồn 1 chỗ', overlaps === 0, `chồng=${overlaps}`);
}

// ---------- 6. Bị phá thì biến mất, không còn bị nhắm ----------
{
    const w = quietWorld();
    const c = w.centerOf(castleOf(w, HUMAN));
    const archers = [0, 1, 2].map(i => w.spawnUnit('archer', HUMAN, c.x - 64 + i * 64, c.y - 200));
    const enemy = w.spawnUnit('infantry', AI_PLAYER, c.x, c.y - 420);
    commandAttack(w, HUMAN, archers.map(a => a.id), enemy.id);
    let sawArrow = false;
    for (let i = 0; i < 600 && w.entities.has(enemy.id); i++) { w.tick(0.05); if (w.projectiles.length) sawArrow = true; }
    check('Cung thủ bắn tên bay (có projectile)', sawArrow);
    check('Đơn vị chết thì bị xoá', !w.entities.has(enemy.id) && !w.units.includes(enemy));
    run(w, 1);
    check('Không còn ai nhắm vào đơn vị đã chết', !w.units.some(u => u.order?.type === 'attack' && u.order.target === enemy.id) && !w.projectiles.some(p => p.target === enemy.id));
    // Công trình bị phá.
    const castle2 = castleOf(w, AI_PLAYER);
    const raiders = [0, 1, 2, 3].map(i => w.spawnUnit('infantry', HUMAN, w.centerOf(castle2).x + (i - 1.5) * 50, w.centerOf(castle2).y + 160));
    castle2.hp = 60;
    commandAttack(w, HUMAN, raiders.map(r => r.id), castle2.id);
    run(w, 15);
    check('Công trình bị phá thì biến mất', !w.entities.has(castle2.id) && w.map.isFree(castle2.tx, castle2.ty));
    check('Không còn ai nhắm vào công trình đã phá', !w.units.some(u => u.order?.type === 'attack' && u.order.target === castle2.id));
}

// ---------- 6b. Khắc chế ----------
{
    const w = quietWorld();
    const c = w.centerOf(castleOf(w, HUMAN));
    const inf = w.spawnUnit('infantry', HUMAN, c.x, c.y - 250);
    const cav = w.spawnUnit('cavalry', AI_PLAYER, c.x + 40, c.y - 250);
    const hp0 = cav.hp;
    commandAttack(w, HUMAN, [inf.id], cav.id);
    w.ai = [];
    for (let i = 0; i < 40 && cav.hp === hp0; i++) w.tick(0.05);
    check('Bộ binh đánh kỵ binh +50%', Math.abs(hp0 - cav.hp - UNITS.infantry.damage * 1.5) < 0.01, `-${(hp0 - cav.hp).toFixed(1)}`);
}

// ---------- 8. Thắng / thua ----------
{
    const w = quietWorld();
    for (const b of w.buildings.filter(b => b.owner === AI_PLAYER)) kill(w, b);
    run(w, 1.5);
    check('Phá hết công trình địch thì thắng', w.winner === HUMAN);
    const w2 = quietWorld();
    for (const b of w2.buildings.filter(b => b.owner === HUMAN)) kill(w2, b);
    run(w2, 1.5);
    check('Mất hết công trình thì thua', w2.winner === AI_PLAYER);
}

// ---------- Lưu / tải ----------
{
    const w = quietWorld();
    const pawns = pawnsOf(w, HUMAN);
    commandGather(w, HUMAN, pawns.map(p => p.id), nearestNode(w, 'tree', pawns[0].x, pawns[0].y).id);
    run(w, 30);
    const json = serialize(w);
    const w2 = deserialize(json);
    check('Tải lại giữ nguyên số thực thể và tài nguyên', w2.entities.size === w.entities.size && JSON.stringify(w2.players) === JSON.stringify(w.players));
    run(w2, 30);
    check('Sau khi tải, pawn vẫn tiếp tục khai thác', w2.players[HUMAN].resources.wood > w.players[HUMAN].resources.wood);
}

// ---------- 7. AI tự phát triển và tấn công (người chơi đứng yên) ----------
for (const diff of ['easy', 'normal', 'hard'] as const) {
    const w = createWorld(diff, 99);
    let firstAttack = -1;
    let maxAiPawns = 0;
    let ageAt = -1;
    const t0 = performance.now();
    for (let t = 0; t < 1500 && w.winner === null; t += 0.05) {
        w.tick(0.05);
        if (firstAttack < 0 && w.units.some(u => u.owner === AI_PLAYER && u.type !== 'pawn' && u.order?.type === 'attack' && w.get(u.order.target)?.owner === HUMAN)) firstAttack = w.time;
        maxAiPawns = Math.max(maxAiPawns, pawnsOf(w, AI_PLAYER).length);
        if (ageAt < 0 && w.players[AI_PLAYER].age === 2) ageAt = w.time;
    }
    const types = [...new Set(w.buildings.filter(b => b.owner === AI_PLAYER).map(b => b.type))];
    const ms = performance.now() - t0;
    check(`AI ${diff}: phát triển kinh tế`, maxAiPawns >= 10 && types.length >= 4, `pawn tối đa ${maxAiPawns}, công trình: ${types.join(',')}, lên đời: ${ageAt < 0 ? 'không' : Math.round(ageAt) + 's'}`);
    check(`AI ${diff}: tấn công người chơi`, firstAttack > 0, `đợt đầu lúc ${Math.round(firstAttack)}s`);
    check(`AI ${diff}: người chơi bỏ mặc thì thua`, w.winner === AI_PLAYER, `winner=${w.winner} lúc ${Math.round(w.time)}s (mô phỏng ${Math.round(ms)}ms)`);
}

console.log(failed ? `\n${failed} kiểm thử thất bại` : '\nTất cả kiểm thử đạt');
if (failed) process.exitCode = 1;
