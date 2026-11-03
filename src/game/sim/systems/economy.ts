import { BUILDINGS, ECONOMY, FARM_GATHER_RATE, NODES, NodeType, ResourceType, TILE } from '../../config/balance';
import { Building, Entity, ResourceNode, Unit } from '../types';
import type { World } from '../World';

/** Tài nguyên mà thực thể cung cấp (node hoặc nông trại), null nếu không khai thác được. */
export function resourceOf(e: Entity | undefined): ResourceType | null {
    if (!e) return null;
    if (e.kind === 'node') return NODES[e.type].resource;
    if (e.kind === 'building' && e.type === 'farm' && e.built) return 'food';
    return null;
}

export function gatherRateOf(e: Entity): number {
    if (e.kind === 'node') return NODES[e.type].gatherRate;
    return FARM_GATHER_RATE;
}

export function amountLeft(e: Entity): number {
    if (e.kind === 'node') return e.amount;
    if (e.kind === 'building') return e.food;
    return 0;
}

/** Công trình đã xong gần nhất nhận loại tài nguyên này. */
export function findDropSite(world: World, owner: number, res: ResourceType, x: number, y: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of world.buildings) {
        if (b.owner !== owner || !b.built) continue;
        if (!BUILDINGS[b.type].accepts?.includes(res)) continue;
        const c = world.centerOf(b);
        const d = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d < bestD) { bestD = d; best = b; }
    }
    return best;
}

/** Nông trại đã có người làm (khác `except`). */
export function farmTaken(world: World, farm: Building, except?: Unit): boolean {
    return world.units.some(u => u !== except && u.order?.type === 'gather' && u.order.target === farm.id);
}

/**
 * Nguồn gần nhất: ưu tiên cùng kiểu (vd. cây), sau đó cùng loại tài nguyên.
 * `kind` = 'farm' thì tìm nông trại trống của người chơi.
 */
export function findNearestSource(
    world: World, u: Unit, kind: NodeType | 'farm' | null, res: ResourceType, x: number, y: number,
    radiusTiles = ECONOMY.searchRadius,
): Entity | null {
    const r2 = (radiusTiles * TILE) ** 2;
    let best: Entity | null = null;
    let bestScore = Infinity;
    const consider = (e: Entity, sameKind: boolean) => {
        const c = world.centerOf(e);
        const d = (c.x - x) ** 2 + (c.y - y) ** 2;
        if (d > r2) return;
        const score = d * (sameKind ? 1 : 4);
        if (score < bestScore) { bestScore = score; best = e; }
    };
    for (const n of world.nodes) {
        if (n.amount <= 0 || NODES[n.type].resource !== res) continue;
        consider(n, n.type === kind);
    }
    if (res === 'food') {
        for (const b of world.buildings) {
            if (b.type !== 'farm' || !b.built || b.owner !== u.owner || farmTaken(world, b, u)) continue;
            consider(b, kind === 'farm');
        }
    }
    return best;
}

/** Trừ tài nguyên khỏi nguồn; xoá nguồn khi cạn. Trả về lượng lấy được. */
export function takeFrom(world: World, e: ResourceNode | Building, want: number): number {
    if (e.kind === 'node') {
        const got = Math.min(want, e.amount);
        e.amount -= got;
        if (e.amount <= 0.0001) world.removeEntity(e);
        return got;
    }
    const got = Math.min(want, e.food);
    e.food -= got;
    if (e.food <= 0.0001) {
        world.removeEntity(e);
        world.message(e.owner, 'Một nông trại đã cạn thức ăn.', 'farm-empty', 10, 'info');
    }
    return got;
}

export function nodeKindOf(e: Entity): NodeType | 'farm' | null {
    if (e.kind === 'node') return e.type;
    if (e.kind === 'building' && e.type === 'farm') return 'farm';
    return null;
}

/**
 * Tìm nguồn tài nguyên `res` gần nhất mà đơn vị đi tới được (BFS trên lưới từ vị trí đơn vị).
 * Ưu tiên cùng kiểu `kind` nếu có trong phạm vi gần.
 */
export function findReachableSource(
    world: World, u: Unit, res: ResourceType, kind: NodeType | 'farm' | null, exclude = 0, maxTiles = 3000,
): Entity | null {
    const map = world.map;
    const W = map.width;
    const sx = Math.max(0, Math.min(W - 1, Math.floor(u.x / TILE)));
    const sy = Math.max(0, Math.min(map.height - 1, Math.floor(u.y / TILE)));
    const seen = new Uint8Array(W * map.height);
    const queue = [sy * W + sx];
    seen[queue[0]] = 1;
    let first: Entity | null = null;
    let extra = 0;
    const ok = (e: Entity | undefined): e is Entity => {
        if (!e || e.id === exclude) return false;
        if (e.kind === 'node') return e.amount > 0 && NODES[e.type].resource === res;
        return res === 'food' && e.kind === 'building' && e.type === 'farm' && e.built && e.owner === u.owner && !farmTaken(world, e, u);
    };
    for (let qi = 0; qi < queue.length && qi < maxTiles; qi++) {
        const c = queue[qi];
        const cx = c % W, cy = (c - cx) / W;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (!map.inBounds(nx, ny)) continue;
                const ni = ny * W + nx;
                const e = world.get(map.occupant[ni]);
                if (ok(e)) {
                    if (!kind || nodeKindOf(e) === kind) return e;
                    first ??= e;
                }
                if (seen[ni] || map.solid[ni] || (dx && dy)) continue;
                seen[ni] = 1;
                queue.push(ni);
            }
        }
        // Đã có nguồn khác kiểu: tìm thêm một đoạn ngắn cho đúng kiểu.
        if (first && ++extra > 150) return first;
    }
    return first;
}
