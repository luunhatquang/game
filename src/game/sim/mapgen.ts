import { AI_CONFIGS, Difficulty } from '../config/ai';
import { BUILDINGS, MAP, NodeType, START } from '../config/balance';
import { GameMap, TERRAIN } from './GameMap';
import { World } from './World';
import { AI_PLAYER, HUMAN } from './types';
import { AiController } from './ai/AiController';

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Toạ độ nhà chính của người chơi 0; người chơi 1 đối xứng tâm. */
function castlePos(W: number, H: number) {
    const s = BUILDINGS.castle;
    const p0 = { x: 8, y: H - 12 };
    return [p0, { x: W - p0.x - s.w, y: H - p0.y - s.h }];
}

export function createWorld(difficulty: Difficulty, seed = Math.floor(Math.random() * 1e9)): World {
    const W = MAP.width, H = MAP.height;
    const rnd = mulberry32(seed);
    const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    const terrain = new Uint8Array(W * H);
    const mirror = (x: number, y: number) => ({ x: W - 1 - x, y: H - 1 - y });
    const setT = (x: number, y: number, v: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        terrain[y * W + x] = v;
        const m = mirror(x, y);
        terrain[m.y * W + m.x] = v;
    };
    const castles = castlePos(W, H);
    const bases = castles.map(c => ({ x: c.x + BUILDINGS.castle.w / 2, y: c.y + BUILDINGS.castle.h / 2 }));
    const distBase = (x: number, y: number) => Math.min(...bases.map(b => Math.hypot(b.x - x, b.y - y)));

    // Viền nước không đều.
    for (let x = 0; x < W; x++) {
        const t = 1 + (Math.sin(x * 0.35 + seed) > 0.4 ? 1 : 0);
        for (let y = 0; y < t; y++) setT(x, y, TERRAIN.WATER);
    }
    for (let y = 0; y < H; y++) {
        const t = 1 + (Math.cos(y * 0.4 + seed) > 0.4 ? 1 : 0);
        for (let x = 0; x < t; x++) setT(x, y, TERRAIN.WATER);
    }

    const blob = (cx: number, cy: number, r: number, v: number) => {
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
            for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
                const d = Math.hypot(x - cx, y - cy) + (rnd() - 0.5) * 1.2;
                if (d <= r) setT(x, y, v);
            }
        }
    };
    for (let i = 0; i < MAP.lakes; i++) {
        for (let tries = 0; tries < 30; tries++) {
            const x = ri(6, W - 7), y = ri(6, H - 7);
            if (distBase(x, y) < 17) continue;
            blob(x, y, ri(2, 4), TERRAIN.WATER);
            break;
        }
    }
    for (let i = 0; i < MAP.rockClusters; i++) {
        for (let tries = 0; tries < 30; tries++) {
            const x = ri(4, W - 5), y = ri(4, H - 5);
            if (distBase(x, y) < 12) continue;
            blob(x, y, ri(1, 2), TERRAIN.ROCK);
            break;
        }
    }
    // Giữ vùng căn cứ là cỏ.
    for (const b of bases) {
        for (let y = Math.floor(b.y - 8); y <= b.y + 8; y++) {
            for (let x = Math.floor(b.x - 8); x <= b.x + 8; x++) {
                if (x > 2 && y > 2 && x < W - 3 && y < H - 3 && Math.hypot(x - b.x, y - b.y) < 8) terrain[y * W + x] = TERRAIN.GRASS;
            }
        }
    }

    // Khối đá cao 1 ô trông như vách lơ lửng: nâng lên thành 2 ô.
    const isRock = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && terrain[y * W + x] === TERRAIN.ROCK;
    for (let y = 1; y < H - 1; y++) {
        for (let x = 0; x < W; x++) {
            if (isRock(x, y) && !isRock(x, y - 1) && !isRock(x, y + 1)) {
                if (distBase(x, y - 1) > 8 && terrain[(y - 1) * W + x] === TERRAIN.GRASS) setT(x, y - 1, TERRAIN.ROCK);
                else setT(x, y, TERRAIN.GRASS);
            }
        }
    }

    const map = new GameMap(W, H, terrain);
    const world = new World(map, seed);
    const res = { ...START.resources };
    world.addPlayer(false, difficulty, res);
    const aiRes = { ...res };
    for (const [k, v] of Object.entries(AI_CONFIGS[difficulty].startBonus)) aiRes[k as keyof typeof aiRes] += v;
    world.addPlayer(true, difficulty, aiRes);

    // Nhà chính + pawn ban đầu.
    [HUMAN, AI_PLAYER].forEach((owner, i) => {
        const c = castles[i];
        world.placeBuilding('castle', owner, c.x, c.y, true);
        for (let k = 0; k < START.pawns; k++) {
            const dx = i === 0 ? 1 : -1;
            world.spawnUnit('pawn', owner, (bases[i].x + dx * (k - 1.5) * 0.9) * 64, (bases[i].y + (i === 0 ? -2.3 : 2.3)) * 64);
        }
    });

    // Vùng cấm đặt tài nguyên quanh nhà chính.
    const reserved = (x: number, y: number) => bases.some(b => Math.abs(x + 0.5 - b.x) < 4.5 && Math.abs(y + 0.5 - b.y) < 4);
    const tryNode = (type: NodeType, x: number, y: number, variant: number): boolean => {
        const m = mirror(x, y);
        if (!map.isFree(x, y) || !map.isFree(m.x, m.y) || reserved(x, y)) return false;
        world.addNode(type, x, y, variant);
        if (m.x !== x || m.y !== y) world.addNode(type, m.x, m.y, variant);
        return true;
    };
    /** Đặt cụm tài nguyên gần (cx,cy) ở khoảng cách [dMin,dMax]. */
    const cluster = (type: NodeType, cx: number, cy: number, dMin: number, dMax: number, size: number, spread: number) => {
        for (let tries = 0; tries < 60; tries++) {
            const a = rnd() * Math.PI * 2;
            const d = dMin + rnd() * (dMax - dMin);
            const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
            if (!map.isFree(x, y) || reserved(x, y)) continue;
            let placed = 0;
            for (let k = 0; k < size * 4 && placed < size; k++) {
                const nx = x + ri(-spread, spread), ny = y + ri(-spread, spread);
                if (tryNode(type, nx, ny, ri(0, 3))) placed++;
            }
            if (placed) return;
        }
    };
    const forest = (cx: number, cy: number, r: number, density: number) => {
        for (let y = Math.floor(cy - r); y <= cy + r; y++) {
            for (let x = Math.floor(cx - r); x <= cx + r; x++) {
                if (Math.hypot(x - cx, y - cy) <= r && rnd() < density) tryNode('tree', x, y, ri(0, 3));
            }
        }
    };

    const b0 = bases[0];
    for (let i = 0; i < MAP.goldPerBase; i++) cluster('gold', b0.x, b0.y, 7, 10, MAP.mineClusterSize, 1);
    for (let i = 0; i < MAP.stonePerBase; i++) cluster('stone', b0.x, b0.y, 8, 11, MAP.mineClusterSize, 1);
    cluster('berry', b0.x, b0.y, 5, 7, MAP.berriesPerBase, 1);
    for (let i = 0; i < MAP.sheepPerBase; i++) cluster('sheep', b0.x, b0.y, 4, 8, 1, 0);
    // Rừng sát căn cứ.
    for (let i = 0; i < 2; i++) {
        const a = -Math.PI / 2 + (i === 0 ? -0.4 : 0.9) + rnd() * 0.5;
        forest(b0.x + Math.cos(a) * 11, b0.y + Math.sin(a) * 9, ri(3, 4), 0.85);
    }
    // Rừng rải rác + mỏ giữa bản đồ.
    const forests = Math.round(W * H * MAP.trees / 30);
    for (let i = 0; i < forests; i++) {
        const x = ri(3, W - 4), y = ri(3, H - 4);
        if (distBase(x, y) < 13) continue;
        forest(x, y, ri(1, 3), 0.75);
    }
    for (let i = 0; i < MAP.extraGold; i++) cluster('gold', W / 2, H / 2, 4, 18, MAP.mineClusterSize, 1);
    for (let i = 0; i < MAP.extraStone; i++) cluster('stone', W / 2, H / 2, 4, 18, MAP.mineClusterSize, 1);

    ensureConnected(world, bases[0], bases[1]);
    clearEnclosedResources(world, bases[0]);
    world.ai.push(new AiController(world, AI_PLAYER));
    world.updatePopulation();
    world.fog.update(world, 0, true);
    return world;
}

/** Nếu 2 căn cứ không đi thông, mở một hành lang (xoá cây/đá/nước). */
function ensureConnected(world: World, a: { x: number; y: number }, b: { x: number; y: number }): void {
    const map = world.map;
    const reach = () => {
        const seen = new Uint8Array(map.width * map.height);
        const start = map.nearestOpen(Math.floor(a.x), Math.floor(a.y + 3))!;
        const q = [start.y * map.width + start.x];
        seen[q[0]] = 1;
        while (q.length) {
            const c = q.pop()!;
            const cx = c % map.width, cy = (c - cx) / map.width;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (map.isSolid(nx, ny)) continue;
                const ni = ny * map.width + nx;
                if (!seen[ni]) { seen[ni] = 1; q.push(ni); }
            }
        }
        const end = map.nearestOpen(Math.floor(b.x), Math.floor(b.y - 3))!;
        return seen[end.y * map.width + end.x] === 1;
    };
    if (reach()) return;
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = Math.round(a.x + (b.x - a.x) * t), cy = Math.round(a.y + (b.y - a.y) * t);
        for (let y = cy - 1; y <= cy + 1; y++) {
            for (let x = cx - 1; x <= cx + 1; x++) {
                if (!map.inBounds(x, y)) continue;
                const occ = world.get(map.occupant[map.idx(x, y)]);
                if (occ && occ.kind === 'node') world.removeEntity(occ);
                if (!occ || occ.kind === 'node') {
                    map.terrain[map.idx(x, y)] = TERRAIN.GRASS;
                    map.solid[map.idx(x, y)] = 0;
                }
            }
        }
    }
}

/** Mỏ / bụi quả / cừu bị rừng bao kín: chặt bớt cây xung quanh (đối xứng) cho tới khi tới được. */
function clearEnclosedResources(world: World, base: { x: number; y: number }): void {
    const map = world.map;
    const W = map.width, H = map.height;
    for (let pass = 0; pass < 4; pass++) {
        const seen = new Uint8Array(W * H);
        const start = map.nearestOpen(Math.floor(base.x), Math.floor(base.y + 3))!;
        const q = [start.y * W + start.x];
        seen[q[0]] = 1;
        while (q.length) {
            const c = q.pop()!;
            const cx = c % W, cy = (c - cx) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (map.isSolid(nx, ny)) continue;
                const ni = ny * W + nx;
                if (!seen[ni]) { seen[ni] = 1; q.push(ni); }
            }
        }
        let changed = false;
        for (const n of world.nodes.slice()) {
            if (n.type === 'tree') continue;
            let ok = false;
            for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) {
                if (map.inBounds(n.tx + dx, n.ty + dy) && seen[map.idx(n.tx + dx, n.ty + dy)]) ok = true;
            }
            if (ok) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                for (const [x, y] of [[n.tx + dx, n.ty + dy], [W - 1 - (n.tx + dx), H - 1 - (n.ty + dy)]]) {
                    if (!map.inBounds(x, y)) continue;
                    const e = world.get(map.occupant[map.idx(x, y)]);
                    if (e && e.kind === 'node' && e.type === 'tree') { world.removeEntity(e); changed = true; }
                }
            }
        }
        if (!changed) return;
    }
}
