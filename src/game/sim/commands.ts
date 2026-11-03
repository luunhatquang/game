import { AGE_UP, BUILDINGS, BuildingType, PRODUCTION, TILE, UNITS, UnitType } from '../config/balance';
import { GameMap } from './GameMap';
import { Building, Entity, HUMAN, Unit } from './types';
import type { World } from './World';
import { kill } from './systems/combat';
import { resourceOf } from './systems/economy';
import { setOrder } from './systems/units';

export interface Result { ok: boolean; msg?: string }

function fail(world: World, owner: number, msg: string): Result {
    world.message(owner, msg, msg, 1.5);
    return { ok: false, msg };
}

export function ownUnits(world: World, owner: number, ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
        const e = world.get(id);
        if (e && e.kind === 'unit' && e.owner === owner) out.push(e);
    }
    return out;
}

/** Các điểm đội hình quanh (x,y), mỗi điểm nằm trên ô đi được. */
export function formation(world: World, n: number, x: number, y: number): { x: number; y: number }[] {
    const spacing = 42;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        let px = x + (c - (cols - 1) / 2) * spacing;
        let py = y + (r - (rows - 1) / 2) * spacing;
        const tx = GameMap.toTile(px), ty = GameMap.toTile(py);
        if (world.map.isSolid(tx, ty)) {
            const p = world.map.nearestOpen(tx, ty, 8);
            if (p) { px = GameMap.center(p.x) + (Math.random() - 0.5) * 20; py = GameMap.center(p.y) + (Math.random() - 0.5) * 20; }
        }
        pts.push({ x: px, y: py });
    }
    return pts;
}

export function commandMove(world: World, owner: number, ids: number[], x: number, y: number, attackMove = false): Result {
    const units = ownUnits(world, owner, ids);
    if (!units.length) return { ok: false };
    const pts = formation(world, units.length, x, y);
    // Gán điểm cho đơn vị gần nhất để hạn chế đi chéo nhau.
    const free = units.slice();
    pts.sort((a, b) => Math.hypot(b.x - x, b.y - y) - Math.hypot(a.x - x, a.y - y));
    for (const p of pts) {
        let bi = 0, bd = Infinity;
        free.forEach((u, i) => { const d = (u.x - p.x) ** 2 + (u.y - p.y) ** 2; if (d < bd) { bd = d; bi = i; } });
        const u = free.splice(bi, 1)[0];
        setOrder(world, u, { type: attackMove ? 'attackMove' : 'move', x: p.x, y: p.y });
    }
    return { ok: true };
}

export function commandAttack(world: World, owner: number, ids: number[], target: number): Result {
    for (const u of ownUnits(world, owner, ids)) setOrder(world, u, { type: 'attack', target });
    return { ok: true };
}

export function commandGather(world: World, owner: number, ids: number[], target: number): Result {
    const units = ownUnits(world, owner, ids);
    const pawns = units.filter(u => u.type === 'pawn');
    const t = world.get(target);
    if (!t) return { ok: false };
    for (const u of pawns) setOrder(world, u, { type: 'gather', target });
    const others = units.filter(u => u.type !== 'pawn').map(u => u.id);
    if (others.length) { const c = world.centerOf(t); commandMove(world, owner, others, c.x, c.y + TILE); }
    return { ok: true };
}

export function commandBuild(world: World, owner: number, ids: number[], target: number): Result {
    for (const u of ownUnits(world, owner, ids)) if (u.type === 'pawn') setOrder(world, u, { type: 'build', target });
    return { ok: true };
}

export type SmartKind = 'move' | 'attack' | 'gather' | 'build' | 'rally' | 'none';

/** Lệnh chuột phải theo ngữ cảnh. */
export function commandSmart(world: World, owner: number, ids: number[], x: number, y: number, target: Entity | null): SmartKind {
    const units = ownUnits(world, owner, ids);
    if (!units.length) {
        const b = ids.map(id => world.get(id)).find(e => e?.kind === 'building' && e.owner === owner) as Building | undefined;
        if (b && BUILDINGS[b.type].trains) { setRally(world, owner, b.id, x, y, target?.id ?? 0); return 'rally'; }
        return 'none';
    }
    if (target && target.owner !== owner && target.kind !== 'node') {
        commandAttack(world, owner, ids, target.id);
        return 'attack';
    }
    const pawns = units.filter(u => u.type === 'pawn');
    if (target && pawns.length) {
        if (target.kind === 'building' && target.owner === owner && !target.built) {
            commandBuild(world, owner, pawns.map(u => u.id), target.id);
            const others = units.filter(u => u.type !== 'pawn').map(u => u.id);
            if (others.length) commandMove(world, owner, others, x, y);
            return 'build';
        }
        if (resourceOf(target) && (target.kind === 'node' || target.owner === owner)) {
            commandGather(world, owner, ids, target.id);
            return 'gather';
        }
    }
    commandMove(world, owner, ids, x, y);
    return 'move';
}

/** Kiểm tra điều kiện xây (đời, công trình yêu cầu, tài nguyên). */
export function checkBuildable(world: World, owner: number, type: BuildingType): Result {
    const s = BUILDINGS[type];
    const p = world.players[owner];
    if (s.age && p.age < s.age) return { ok: false, msg: `Cần Thời đại ${s.age}` };
    for (const r of s.requires ?? []) {
        if (!world.hasBuilt(owner, r)) return { ok: false, msg: `Cần xây ${BUILDINGS[r].name} trước` };
    }
    if (!world.canAfford(owner, s.cost)) return { ok: false, msg: `Không đủ tài nguyên: thiếu ${world.missing(owner, s.cost)}` };
    return { ok: true };
}

export function canPlace(world: World, owner: number, type: BuildingType, tx: number, ty: number): Result {
    const s = BUILDINGS[type];
    for (let y = ty; y < ty + s.h; y++) {
        for (let x = tx; x < tx + s.w; x++) {
            if (!world.map.isFree(x, y)) return { ok: false, msg: 'Vị trí bị chặn' };
            if (owner === HUMAN && !world.fog.isExplored(x, y)) return { ok: false, msg: 'Vùng chưa khám phá' };
        }
    }
    // Không đặt đè lên đơn vị địch.
    const x0 = tx * TILE, y0 = ty * TILE, x1 = (tx + s.w) * TILE, y1 = (ty + s.h) * TILE;
    for (const u of world.units) {
        if (u.owner !== owner && u.x > x0 && u.x < x1 && u.y > y0 && u.y < y1) return { ok: false, msg: 'Có đơn vị địch ở đây' };
    }
    return { ok: true };
}

export function placeBuilding(world: World, owner: number, type: BuildingType, tx: number, ty: number, builders: number[]): Result & { building?: Building } {
    const can = checkBuildable(world, owner, type);
    if (!can.ok) return fail(world, owner, can.msg!);
    const pos = canPlace(world, owner, type, tx, ty);
    if (!pos.ok) return fail(world, owner, pos.msg!);
    world.pay(owner, BUILDINGS[type].cost);
    const b = world.placeBuilding(type, owner, tx, ty, false);
    commandBuild(world, owner, builders, b.id);
    return { ok: true, building: b };
}

export function canTrain(world: World, owner: number, b: Building, unit: UnitType): Result {
    if (!b.built || b.owner !== owner || !BUILDINGS[b.type].trains?.includes(unit)) return { ok: false, msg: 'Không thể sinh ở đây' };
    if (b.queue.length >= PRODUCTION.maxQueue) return { ok: false, msg: `Hàng đợi đã đầy (${PRODUCTION.maxQueue})` };
    const p = world.players[owner];
    if (p.pop >= p.popCap) return { ok: false, msg: `Đã đủ dân (${p.pop}/${p.popCap}). Hãy xây thêm Nhà dân.` };
    const cost = UNITS[unit].cost;
    if (!world.canAfford(owner, cost)) return { ok: false, msg: `Không đủ tài nguyên: thiếu ${world.missing(owner, cost)}` };
    return { ok: true };
}

export function train(world: World, owner: number, buildingId: number, unit: UnitType): Result {
    const b = world.get(buildingId);
    if (!b || b.kind !== 'building') return { ok: false };
    const can = canTrain(world, owner, b, unit);
    if (!can.ok) return fail(world, owner, can.msg!);
    const cost = UNITS[unit].cost;
    world.pay(owner, cost);
    b.queue.push({ kind: 'unit', unit, cost: { ...cost }, time: UNITS[unit].trainTime });
    return { ok: true };
}

export function canAgeUp(world: World, owner: number, b: Building): Result {
    const p = world.players[owner];
    if (!b.built || !BUILDINGS[b.type].canAgeUp) return { ok: false, msg: 'Không thể nghiên cứu ở đây' };
    if (p.age >= 2) return { ok: false, msg: 'Đã ở Thời đại 2' };
    if (world.buildings.some(o => o.owner === owner && o.queue.some(q => q.kind === 'age'))) return { ok: false, msg: 'Đang nghiên cứu lên đời' };
    if (b.queue.length >= PRODUCTION.maxQueue) return { ok: false, msg: 'Hàng đợi đã đầy' };
    if (!world.canAfford(owner, AGE_UP.cost)) return { ok: false, msg: `Không đủ tài nguyên: thiếu ${world.missing(owner, AGE_UP.cost)}` };
    return { ok: true };
}

export function researchAge(world: World, owner: number, buildingId: number): Result {
    const b = world.get(buildingId);
    if (!b || b.kind !== 'building' || b.owner !== owner) return { ok: false };
    const can = canAgeUp(world, owner, b);
    if (!can.ok) return fail(world, owner, can.msg!);
    world.pay(owner, AGE_UP.cost);
    b.queue.push({ kind: 'age', cost: { ...AGE_UP.cost }, time: AGE_UP.time });
    return { ok: true };
}

export function cancelQueue(world: World, owner: number, buildingId: number, index: number): Result {
    const b = world.get(buildingId);
    if (!b || b.kind !== 'building' || b.owner !== owner || !b.queue[index]) return { ok: false };
    const [item] = b.queue.splice(index, 1);
    if (index === 0) b.queueTime = 0;
    world.refund(owner, item.cost);
    return { ok: true };
}

export function setRally(world: World, owner: number, buildingId: number, x: number, y: number, target = 0): Result {
    const b = world.get(buildingId);
    if (!b || b.kind !== 'building' || b.owner !== owner) return { ok: false };
    b.rally = { x, y, target };
    return { ok: true };
}

/** Huỷ đơn vị / công trình. Công trình đang xây được hoàn lại toàn bộ chi phí. */
export function deleteEntity(world: World, owner: number, id: number): Result {
    const e = world.get(id);
    if (!e || e.owner !== owner || e.kind === 'node') return { ok: false };
    if (e.kind === 'building') {
        if (!e.built) world.refund(owner, BUILDINGS[e.type].cost);
        for (const q of e.queue) world.refund(owner, q.cost);
        e.queue = [];
        const c = world.centerOf(e);
        world.removeEntity(e);
        world.emit({ type: 'destroyed', x: c.x, y: c.y, building: e.type, owner });
        return { ok: true };
    }
    kill(world, e);
    return { ok: true };
}

export function commandStop(world: World, owner: number, ids: number[]): Result {
    for (const u of ownUnits(world, owner, ids)) setOrder(world, u, null);
    return { ok: true };
}
