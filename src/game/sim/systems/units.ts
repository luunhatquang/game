import { BUILDINGS, ECONOMY, NodeType, TILE, UNITS } from '../../config/balance';
import { AI_CONFIGS } from '../../config/ai';
import { GameMap } from '../GameMap';
import { Building, Entity, Order, Unit } from '../types';
import type { World } from '../World';
import { amountLeft, farmTaken, findDropSite, findNearestSource, findReachableSource, gatherRateOf, nodeKindOf, resourceOf, takeFrom } from './economy';
import { findEnemyNear, isEnemy, performAttack } from './combat';

/** Khoảng cách chạm để khai thác / xây (px, tính từ mép). */
const WORK_REACH = 36;
const SCAN_INTERVAL = 0.5;

export function isMilitary(u: Unit): boolean {
    return u.type !== 'pawn';
}

/** Đặt lệnh mới, xoá trạng thái di chuyển cũ. */
export function setOrder(world: World, u: Unit, order: Order | null, keepResume = false): void {
    u.order = order;
    if (!keepResume) u.resume = null;
    u.path = [];
    u.pathIndex = 0;
    u.stuckTime = 0;
    u.repaths = 0;
    if (!order) { u.state = 'idle'; return; }
    switch (order.type) {
        case 'move':
        case 'attackMove':
            u.state = 'move';
            moveTo(world, u, order.x, order.y);
            break;
        case 'gather': {
            const t = world.get(order.target);
            if (t) {
                const kind = nodeKindOf(t);
                const res = resourceOf(t);
                if (res && u.carryType && u.carryType !== res) { u.carry = 0; u.carryType = null; }
                if (kind) {
                    const c = world.centerOf(t);
                    u.lastNodeType = kind; u.lastNodeX = c.x; u.lastNodeY = c.y;
                }
                u.state = u.carry >= ECONOMY.carryCapacity ? 'return' : 'gather';
                if (u.state === 'gather') approach(world, u, t);
            }
            break;
        }
        case 'build':
            u.state = 'build';
            { const t = world.get(order.target); if (t) approach(world, u, t); }
            break;
        case 'attack':
            u.state = 'attack';
            { const t = world.get(order.target); if (t) approach(world, u, t); }
            break;
    }
}

export function moveTo(world: World, u: Unit, x: number, y: number): void {
    u.goalX = x;
    u.goalY = y;
    u.goalRect = null;
    u.path = [];
    u.pathIndex = 0;
    world.requestPath(u);
}

/** Đi tới cạnh thực thể. */
export function approach(world: World, u: Unit, e: Entity): void {
    const c = world.centerOf(e);
    u.goalX = c.x;
    u.goalY = c.y;
    u.goalRect = e.kind === 'unit'
        ? { x0: e.x - 1, y0: e.y - 1, x1: e.x + 1, y1: e.y + 1 }
        : world.rectOf(e);
    u.path = [];
    u.pathIndex = 0;
    world.requestPath(u);
}

function goalIs(u: Unit, e: Entity, world: World): boolean {
    if (!u.goalRect) return false;
    const c = world.centerOf(e);
    return Math.abs(u.goalX - c.x) < TILE && Math.abs(u.goalY - c.y) < TILE;
}

function pathDone(u: Unit): boolean {
    return u.pathIndex * 2 >= u.path.length && !u.pathPending;
}

/**
 * Đã tới cuối đường mà chưa chạm mục tiêu: chờ chút rồi tìm lại đường.
 * Trả về false khi đã thử quá nhiều lần (mục tiêu không tới được).
 */
function retryApproach(world: World, u: Unit, e: Entity, dt: number): boolean {
    if (!goalIs(u, e, world)) { approach(world, u, e); u.repaths = 0; return true; }
    if (!pathDone(u)) return true;
    u.stuckTime -= dt;
    if (u.stuckTime > 0) return true;
    if (++u.repaths > 3) return false;
    approach(world, u, e);
    u.stuckTime = 0.4;
    return true;
}

/** Di chuyển theo đường. Trả về true khi đã hết đường. */
function followPath(world: World, u: Unit, dt: number): boolean {
    if (u.pathIndex * 2 >= u.path.length) {
        u.moving = false;
        return !u.pathPending;
    }
    const tx = u.path[u.pathIndex * 2];
    const ty = u.path[u.pathIndex * 2 + 1];
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    const step = UNITS[u.type].speed * dt;
    const last = (u.pathIndex + 1) * 2 >= u.path.length;
    if (d <= Math.max(step, last ? 2 : 10)) {
        if (last) { tryMove(world, u, tx, ty); }
        u.pathIndex++;
        u.stuckTime = 0;
        return u.pathIndex * 2 >= u.path.length && !u.pathPending;
    }
    const ox = u.x, oy = u.y;
    tryMove(world, u, u.x + (dx / d) * step, u.y + (dy / d) * step);
    if (Math.abs(dx) > 1) u.facing = dx > 0 ? 1 : -1;
    u.moving = true;
    const moved = Math.hypot(u.x - ox, u.y - oy);
    if (moved < step * 0.3) {
        u.stuckTime += dt;
        if (u.stuckTime > 0.8) {
            u.stuckTime = 0;
            u.repaths++;
            // Điểm đến bị đơn vị khác chiếm: dừng khi đã gần.
            if (!u.goalRect && u.repaths >= 2 && Math.hypot(u.goalX - u.x, u.goalY - u.y) < TILE * 1.5) {
                u.path = []; u.moving = false;
                return true;
            }
            world.requestPath(u);
        }
    } else {
        u.stuckTime = Math.max(0, u.stuckTime - dt);
    }
    return false;
}

/** Dịch chuyển nhưng không đi vào ô bị chặn. */
export function tryMove(world: World, u: Unit, nx: number, ny: number): void {
    const map = world.map;
    if (!map.isSolid(GameMap.toTile(nx), GameMap.toTile(ny))) { u.x = nx; u.y = ny; return; }
    if (!map.isSolid(GameMap.toTile(nx), GameMap.toTile(u.y))) { u.x = nx; return; }
    if (!map.isSolid(GameMap.toTile(u.x), GameMap.toTile(ny))) { u.y = ny; }
}

function stop(u: Unit): void {
    u.path = [];
    u.pathIndex = 0;
    u.moving = false;
}

export function updateUnits(world: World, dt: number): void {
    // Sao chép vì đơn vị có thể bị xoá trong vòng lặp.
    for (const u of world.units.slice()) {
        if (u.state === 'dead') continue;
        u.cooldown = Math.max(0, u.cooldown - dt);
        u.actionTime = Math.max(0, u.actionTime - dt);
        u.scanTimer -= dt;
        // Bị kẹt trong ô chặn (vd. công trình mới đặt): đẩy ra.
        if (world.map.isSolid(GameMap.toTile(u.x), GameMap.toTile(u.y))) {
            const p = world.map.nearestOpen(GameMap.toTile(u.x), GameMap.toTile(u.y));
            if (p) { u.x = GameMap.center(p.x); u.y = GameMap.center(p.y); }
        }
        const o = u.order;
        if (!o) { updateIdle(world, u); continue; }
        switch (o.type) {
            case 'move':
                u.state = 'move';
                if (followPath(world, u, dt)) setOrder(world, u, null);
                break;
            case 'attackMove':
                u.state = 'move';
                if (u.scanTimer <= 0) {
                    u.scanTimer = SCAN_INTERVAL;
                    const enemy = findEnemyNear(world, u, UNITS[u.type].sight * TILE, true);
                    if (enemy) {
                        const resume = o;
                        setOrder(world, u, { type: 'attack', target: enemy.id, auto: true });
                        u.resume = resume;
                        break;
                    }
                }
                if (followPath(world, u, dt)) setOrder(world, u, null);
                break;
            case 'gather': updateGather(world, u, dt); break;
            case 'build': updateBuild(world, u, dt); break;
            case 'attack': updateAttack(world, u, dt); break;
        }
    }
}

function updateIdle(world: World, u: Unit): void {
    u.state = 'idle';
    u.moving = false;
    if (!isMilitary(u) || u.scanTimer > 0) return;
    u.scanTimer = SCAN_INTERVAL;
    const enemy = findEnemyNear(world, u, UNITS[u.type].sight * TILE, false);
    if (enemy) setOrder(world, u, { type: 'attack', target: enemy.id, auto: true });
}

function gatherMult(world: World, owner: number): number {
    const p = world.players[owner];
    return p?.isAI ? AI_CONFIGS[p.difficulty].gatherMult : 1;
}

function updateGather(world: World, u: Unit, dt: number): void {
    const o = u.order as { type: 'gather'; target: number };
    let target = world.get(o.target);
    const res = resourceOf(target);

    if (u.state === 'return') {
        const carryType = u.carryType;
        if (!carryType || u.carry <= 0) { u.state = 'gather'; return; }
        const drop = findDropSite(world, u.owner, carryType, u.x, u.y);
        if (!drop) {
            world.message(u.owner, `Không có công trình nhận ${carryType === 'wood' ? 'gỗ' : carryType === 'food' ? 'thức ăn' : carryType === 'gold' ? 'vàng' : 'đá'}.`, 'nodrop-' + carryType, 8);
            stop(u);
            return;
        }
        if (world.distTo(u, drop) <= WORK_REACH) {
            stop(u);
            world.players[u.owner].resources[carryType] += Math.floor(u.carry);
            u.carry = 0;
            u.carryType = null;
            u.state = 'gather';
            if (target && res) approach(world, u, target);
            return;
        }
        if (!retryApproach(world, u, drop, dt)) { setOrder(world, u, null); return; }
        followPath(world, u, dt);
        return;
    }

    // Nguồn đã cạn / mất: tìm nguồn cùng loại gần nhất.
    if (!target || !res || amountLeft(target) <= 0 || (target.kind === 'building' && farmTaken(world, target, u))) {
        const kind = u.lastNodeType as NodeType | 'farm' | null;
        const want = u.carryType ?? (kind === 'farm' ? 'food' : kind ? resourceOfKind(kind) : null);
        const near = want ? findNearestSource(world, u, kind, want, u.lastNodeX || u.x, u.lastNodeY || u.y) : null;
        const next = near && want ? findReachableSource(world, u, want, kind) : null;
        if (!next) {
            if (u.carry > 0) { u.state = 'return'; return; }
            setOrder(world, u, null);
            return;
        }
        o.target = next.id;
        target = next;
        const c = world.centerOf(next);
        u.lastNodeType = nodeKindOf(next);
        u.lastNodeX = c.x; u.lastNodeY = c.y;
        approach(world, u, next);
    }
    const tRes = resourceOf(target)!;
    if (u.carryType && u.carryType !== tRes) { u.carry = 0; u.carryType = null; }

    if (u.carry >= ECONOMY.carryCapacity) { u.state = 'return'; stop(u); return; }

    if (world.distTo(u, target) <= WORK_REACH) {
        stop(u);
        const c = world.centerOf(target);
        if (Math.abs(c.x - u.x) > 4) u.facing = c.x > u.x ? 1 : -1;
        u.actionTime = 0.3;
        const want = Math.min(gatherRateOf(target) * gatherMult(world, u.owner) * dt, ECONOMY.carryCapacity - u.carry);
        const got = takeFrom(world, target as never, want);
        u.carry += got;
        u.carryType = tRes;
        u.repaths = 0;
        if (u.carry >= ECONOMY.carryCapacity - 1e-6) { u.carry = ECONOMY.carryCapacity; u.state = 'return'; }
        return;
    }
    if (!retryApproach(world, u, target, dt)) {
        // Không tới được nguồn này (vd. bị rừng bao quanh): đổi sang nguồn tới được gần nhất.
        const alt = findReachableSource(world, u, tRes, nodeKindOf(target), target.id);
        if (!alt) { setOrder(world, u, null); world.message(u.owner, 'Không tới được nguồn tài nguyên.', 'unreach', 5); return; }
        o.target = alt.id;
        const c = world.centerOf(alt);
        u.lastNodeType = nodeKindOf(alt); u.lastNodeX = c.x; u.lastNodeY = c.y;
        approach(world, u, alt);
        u.repaths = 0;
    }
    followPath(world, u, dt);
}

function resourceOfKind(kind: NodeType): 'wood' | 'food' | 'gold' | 'stone' {
    return kind === 'tree' ? 'wood' : kind === 'gold' ? 'gold' : kind === 'stone' ? 'stone' : 'food';
}

function updateBuild(world: World, u: Unit, dt: number): void {
    const o = u.order as { type: 'build'; target: number };
    const b = world.get(o.target);
    if (!b || b.kind !== 'building' || b.owner !== u.owner) { setOrder(world, u, null); return; }
    if (b.built) { afterBuilt(world, u, b); return; }
    if (world.distTo(u, b) <= WORK_REACH) {
        stop(u);
        u.repaths = 0;
        u.state = 'build';
        u.actionTime = 0.3;
        const c = world.centerOf(b);
        if (Math.abs(c.x - u.x) > 4) u.facing = c.x > u.x ? 1 : -1;
        const s = BUILDINGS[b.type];
        b.progress += dt;
        b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * (1 - ECONOMY.foundationHpRatio) / s.buildTime) * dt);
        if (b.progress >= s.buildTime) {
            b.progress = s.buildTime;
            b.built = true;
            world.emit({ type: 'built', owner: b.owner, id: b.id });
            world.message(b.owner, `${s.name} đã xây xong.`, 'built-' + b.id, 1, 'info');
            afterBuilt(world, u, b);
        }
        return;
    }
    u.state = 'build';
    if (!retryApproach(world, u, b, dt)) { setOrder(world, u, null); return; }
    followPath(world, u, dt);
}

/** Xây xong: khai thác nguồn gần công trình nhận tài nguyên, hoặc xây tiếp công trình gần đó. */
function afterBuilt(world: World, u: Unit, b: Building): void {
    const s = BUILDINGS[b.type];
    const c = world.centerOf(b);
    if (b.type === 'farm' && !farmTaken(world, b, u)) {
        setOrder(world, u, { type: 'gather', target: b.id });
        return;
    }
    if (s.accepts && b.type !== 'castle') {
        for (const res of s.accepts) {
            const src = findNearestSource(world, u, null, res, c.x, c.y, 10);
            if (src) { setOrder(world, u, { type: 'gather', target: src.id }); return; }
        }
    }
    const r2 = (ECONOMY.autoBuildRadius * TILE) ** 2;
    let next: Building | null = null;
    let bestD = Infinity;
    for (const o of world.buildings) {
        if (o.owner !== u.owner || o.built) continue;
        const oc = world.centerOf(o);
        const d = (oc.x - u.x) ** 2 + (oc.y - u.y) ** 2;
        if (d < r2 && d < bestD) { bestD = d; next = o; }
    }
    setOrder(world, u, next ? { type: 'build', target: next.id } : null);
}

function updateAttack(world: World, u: Unit, dt: number): void {
    const o = u.order as { type: 'attack'; target: number; auto?: boolean };
    const t = world.get(o.target);
    if (!t || t.kind === 'node' || !isEnemy(world, u.owner, t)) {
        const resume = u.resume;
        // Đánh xong: tìm địch khác gần đó (lính), hoặc tiếp tục lệnh trước.
        if (isMilitary(u)) {
            const enemy = findEnemyNear(world, u, UNITS[u.type].sight * TILE, !!resume);
            if (enemy) { setOrder(world, u, { type: 'attack', target: enemy.id, auto: true }, true); return; }
        }
        setOrder(world, u, resume);
        return;
    }
    const s = UNITS[u.type];
    // Mục tiêu tự chọn chạy quá xa: bỏ.
    if (o.auto && !u.resume && world.distTo(u, t) > s.sight * TILE * 1.6) { setOrder(world, u, null); return; }
    if (world.distTo(u, t) <= s.range * TILE) {
        stop(u);
        u.repaths = 0;
        u.state = 'attack';
        const c = world.centerOf(t);
        if (Math.abs(c.x - u.x) > 4) u.facing = c.x > u.x ? 1 : -1;
        if (u.cooldown <= 0) {
            u.cooldown = s.cooldown;
            u.actionTime = Math.min(0.6, s.cooldown * 0.6);
            performAttack(world, u, t);
        }
        return;
    }
    u.state = 'attack';
    // Đuổi theo: tìm lại đường khi mục tiêu đã đi xa khỏi điểm đích cũ.
    const c = world.centerOf(t);
    const drift = Math.hypot(c.x - u.goalX, c.y - u.goalY);
    if (t.kind === 'unit' && drift > TILE && !u.pathPending) approach(world, u, t);
    else if (!retryApproach(world, u, t, dt)) { setOrder(world, u, u.resume); return; }
    followPath(world, u, dt);
}

/** Đẩy các đơn vị chồng lên nhau ra xa. */
export function separateUnits(world: World, dt: number): void {
    const near: Unit[] = [];
    for (const u of world.units) {
        const r = UNITS[u.type].radius;
        world.unitsNear(u.x, u.y, r + 22, near);
        let px = 0, py = 0;
        for (const o of near) {
            if (o === u) continue;
            const min = r + UNITS[o.type].radius * 0.8;
            let dx = u.x - o.x;
            let dy = u.y - o.y;
            let d = Math.hypot(dx, dy);
            if (d >= min) continue;
            if (d < 0.01) { dx = (u.id % 7) - 3 + 0.5; dy = (o.id % 5) - 2 + 0.5; d = Math.hypot(dx, dy); }
            // Đơn vị đang làm việc tại chỗ ít bị đẩy hơn.
            const weight = u.moving ? 1 : o.moving ? 0.6 : 0.35;
            const push = (min - d) / d * weight;
            px += dx * push;
            py += dy * push;
        }
        if (px || py) {
            const max = 90 * dt;
            const m = Math.hypot(px, py);
            if (m > max) { px = px / m * max; py = py / m * max; }
            tryMove(world, u, u.x + px, u.y + py);
        }
    }
}
