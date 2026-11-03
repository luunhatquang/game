import { UNITS } from '../../config/balance';
import { GameMap } from '../GameMap';
import { Building, HUMAN, Unit } from '../types';
import type { World } from '../World';
import { buildingAttack } from './combat';
import { resourceOf } from './economy';
import { setOrder } from './units';

export function updateBuildings(world: World, dt: number): void {
    for (const b of world.buildings.slice()) {
        buildingAttack(world, b, dt);
        if (!b.built || !b.queue.length) { b.queueBlocked = false; continue; }
        const item = b.queue[0];
        const player = world.players[b.owner];
        if (item.kind === 'unit') {
            if (player.pop + UNITS[item.unit!].pop > player.popCap) {
                b.queueBlocked = true;
                world.message(b.owner, `Thiếu dân (${player.pop}/${player.popCap}). Hãy xây thêm Nhà dân.`, 'pop-full', 8);
                continue;
            }
        }
        b.queueBlocked = false;
        b.queueTime += dt;
        if (b.queueTime < item.time) continue;
        b.queue.shift();
        b.queueTime = 0;
        if (item.kind === 'unit') {
            const u = spawnFrom(world, b, item.unit!);
            world.emit({ type: 'trained', owner: b.owner, id: u.id });
        } else {
            player.age = 2;
            world.emit({ type: 'age', owner: b.owner, age: 2 });
            world.message(b.owner, b.owner === HUMAN ? 'Đã lên Thời đại 2! Mở Trường bắn, Chuồng ngựa, Tháp canh.' : 'Đối thủ đã lên Thời đại 2.', 'age-' + b.owner, 1, 'info');
            if (b.owner !== HUMAN) world.message(HUMAN, 'Đối thủ đã lên Thời đại 2.', 'age-ai', 1, 'info');
        }
    }
}

/** Ô trống quanh công trình, gần điểm (x,y) nhất. */
export function spawnPoint(world: World, b: Building, x: number, y: number): { x: number; y: number } {
    for (let r = 1; r <= 6; r++) {
        let best: { x: number; y: number } | null = null;
        let bestD = Infinity;
        for (let ty = b.ty - r; ty < b.ty + b.h + r; ty++) {
            for (let tx = b.tx - r; tx < b.tx + b.w + r; tx++) {
                const inner = tx >= b.tx - r + 1 && tx < b.tx + b.w + r - 1 && ty >= b.ty - r + 1 && ty < b.ty + b.h + r - 1;
                if (inner || world.map.isSolid(tx, ty)) continue;
                const d = (GameMap.center(tx) - x) ** 2 + (GameMap.center(ty) - y) ** 2;
                if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
            }
        }
        if (best) return { x: GameMap.center(best.x), y: GameMap.center(best.y) };
    }
    const c = world.centerOf(b);
    return c;
}

function spawnFrom(world: World, b: Building, type: Unit['type']): Unit {
    const c = world.centerOf(b);
    const target = b.rally ?? { x: c.x, y: c.y + b.h * 64, target: 0 };
    const p = spawnPoint(world, b, target.x, target.y);
    const u = world.spawnUnit(type, b.owner, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8);
    if (b.rally) {
        const t = b.rally.target ? world.get(b.rally.target) : undefined;
        if (t && type === 'pawn' && resourceOf(t)) setOrder(world, u, { type: 'gather', target: t.id });
        else if (t && type === 'pawn' && t.kind === 'building' && t.owner === u.owner && !t.built) setOrder(world, u, { type: 'build', target: t.id });
        else setOrder(world, u, { type: 'move', x: b.rally.x, y: b.rally.y });
    }
    return u;
}
