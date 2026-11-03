import { BUILDINGS, BUILDING_DAMAGE_MULT, COUNTERS, PROJECTILE, TILE, UNITS, UnitType } from '../../config/balance';
import { Building, Entity, Unit, GAIA, HUMAN } from '../types';
import type { World } from '../World';
import { isMilitary, setOrder } from './units';

const near: Unit[] = [];
const ATTACK_ALERT_COOLDOWN = 12;

export function isEnemy(world: World, owner: number, e: Entity): boolean {
    if (e.owner === owner || e.owner === GAIA || e.kind === 'node') return false;
    if (e.kind === 'unit' && e.state === 'dead') return false;
    return world.entities.has(e.id);
}

/** Đơn vị địch gần nhất trong bán kính; `buildings` = có tính cả công trình. */
export function findEnemyNear(world: World, u: Unit | { x: number; y: number; owner: number }, radius: number, buildings: boolean): Entity | null {
    let best: Entity | null = null;
    let bestD = radius * radius;
    world.unitsNear(u.x, u.y, radius, near);
    for (const o of near) {
        if (o.owner === u.owner || o.owner < 0 || o.state === 'dead') continue;
        const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
        if (d <= bestD) { bestD = d; best = o; }
    }
    if (best || !buildings) return best;
    for (const b of world.buildings) {
        if (b.owner === u.owner || b.owner < 0) continue;
        const r = world.rectOf(b);
        const dx = Math.max(r.x0 - u.x, 0, u.x - r.x1);
        const dy = Math.max(r.y0 - u.y, 0, u.y - r.y1);
        const d = dx * dx + dy * dy;
        if (d <= bestD) { bestD = d; best = b; }
    }
    return best;
}

export function damageAgainst(attacker: UnitType | null, base: number, target: Entity): number {
    if (target.kind === 'building') return base * (attacker ? BUILDING_DAMAGE_MULT[attacker] : 1);
    if (target.kind === 'unit' && attacker) return base * (COUNTERS[attacker]?.[target.type] ?? 1);
    return base;
}

/** Thực hiện đòn đánh: cận chiến trừ máu ngay, đánh xa bắn tên bay. */
export function performAttack(world: World, u: Unit, t: Entity): void {
    const s = UNITS[u.type];
    const dmg = damageAgainst(u.type, s.damage, t);
    if (s.ranged) spawnArrow(world, u.x, u.y - 20, t, dmg, u.type, u.owner);
    else applyDamage(world, t, dmg, u);
}

function spawnArrow(world: World, x: number, y: number, t: Entity, damage: number, attacker: UnitType | null, owner: number): void {
    const c = world.centerOf(t);
    world.projectiles.push({ id: world.nextId++, x, y, sx: x, sy: y, target: t.id, tx: c.x, ty: c.y, damage, attacker, owner });
    world.emit({ type: 'shoot', owner });
}

export function applyDamage(world: World, t: Entity, amount: number, attacker: Unit | null, attackerOwner = attacker?.owner ?? GAIA): void {
    if (t.kind === 'node' || !world.entities.has(t.id)) return;
    t.hp -= amount;
    const c = world.centerOf(t);
    world.emit({ type: 'hit', x: c.x, y: c.y });
    if (attackerOwner !== t.owner) alertAttack(world, t.owner, c.x, c.y);

    if (t.hp <= 0) {
        kill(world, t);
        return;
    }
    // Phản đòn: lính đang rảnh/di chuyển tự đánh lại.
    if (t.kind === 'unit' && attacker && world.entities.has(attacker.id)) {
        const busy = t.order?.type === 'attack' && world.entities.has(t.order.target);
        if (!busy && isMilitary(t) && t.order?.type !== 'move') {
            const resume = t.order?.type === 'attackMove' ? t.order : null;
            setOrder(world, t, { type: 'attack', target: attacker.id, auto: true });
            t.resume = resume;
        }
    }
}

function alertAttack(world: World, owner: number, x: number, y: number): void {
    if (owner !== HUMAN) return;
    if (world.time - world.lastAttackAlert < ATTACK_ALERT_COOLDOWN) return;
    world.lastAttackAlert = world.time;
    world.emit({ type: 'attacked', owner, x, y });
    world.emit({ type: 'message', owner, text: 'Bạn đang bị tấn công!', level: 'warn' });
}

export function kill(world: World, t: Entity): void {
    if (t.kind === 'unit') {
        world.removeEntity(t);
        world.emit({ type: 'death', x: t.x, y: t.y, unit: t.type, owner: t.owner });
    } else if (t.kind === 'building') {
        // Hoàn trả hàng đợi không được tính khi bị phá.
        const c = world.centerOf(t);
        world.removeEntity(t);
        world.emit({ type: 'destroyed', x: c.x, y: c.y, building: t.type, owner: t.owner });
        if (t.owner === HUMAN) world.message(t.owner, `${BUILDINGS[t.type].name} đã bị phá huỷ!`, 'destroyed-' + t.id, 1);
    }
}

export function updateProjectiles(world: World, dt: number): void {
    const step = PROJECTILE.speed * dt;
    world.projectiles = world.projectiles.filter(p => {
        const t = world.get(p.target);
        if (t && t.kind !== 'node') {
            const c = world.centerOf(t);
            p.tx = c.x;
            p.ty = c.y - (t.kind === 'unit' ? 10 : 0);
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d <= step) {
            if (t && t.kind !== 'node') applyDamage(world, t, p.damage, null, p.owner);
            return false;
        }
        p.x += dx / d * step;
        p.y += dy / d * step;
        return true;
    });
}

/** Tháp / nhà chính tự bắn địch trong tầm. */
export function buildingAttack(world: World, b: Building, dt: number): void {
    const atk = BUILDINGS[b.type].attack;
    if (!atk || !b.built) return;
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown > 0) return;
    const c = world.centerOf(b);
    const range = atk.range * TILE + Math.max(b.w, b.h) * TILE / 2;
    const target = findEnemyNear(world, { x: c.x, y: c.y, owner: b.owner }, range, false);
    if (!target) return;
    b.cooldown = atk.cooldown;
    spawnArrow(world, c.x, c.y - b.h * TILE * 0.6, target, atk.damage, null, b.owner);
}
