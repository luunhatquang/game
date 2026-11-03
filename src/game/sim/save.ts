import { GameMap } from './GameMap';
import { World } from './World';
import { Building, Player, Projectile, ResourceNode, Unit } from './types';
import { AiController, AiState } from './ai/AiController';
import { setOrder } from './systems/units';

const VERSION = 1;
const KEY = 'rts-save';

interface SaveData {
    version: number;
    seed: number;
    time: number;
    nextId: number;
    width: number;
    height: number;
    terrain: string;
    explored: string;
    players: Player[];
    units: Unit[];
    buildings: Building[];
    nodes: ResourceNode[];
    projectiles: Projectile[];
    ai: AiState[];
}

export function serialize(world: World): string {
    const data: SaveData = {
        version: VERSION,
        seed: world.seed,
        time: world.time,
        nextId: world.nextId,
        width: world.map.width,
        height: world.map.height,
        terrain: Array.from(world.map.terrain).join(''),
        explored: Array.from(world.fog.explored).join(''),
        players: world.players,
        units: world.units.map(u => ({ ...u, path: [], pathIndex: 0, pathPending: false })),
        buildings: world.buildings,
        nodes: world.nodes,
        projectiles: world.projectiles,
        ai: world.ai.map(a => a.state),
    };
    return JSON.stringify(data);
}

export function deserialize(json: string): World {
    const d = JSON.parse(json) as SaveData;
    if (d.version !== VERSION) throw new Error('Bản lưu không tương thích');
    const terrain = Uint8Array.from(d.terrain, c => Number(c));
    const world = new World(new GameMap(d.width, d.height, terrain), d.seed);
    world.time = d.time;
    world.players = d.players;
    for (const n of d.nodes) world.addEntity(n);
    for (const b of d.buildings) world.addEntity(b);
    for (const u of d.units) world.addEntity(u);
    world.projectiles = d.projectiles;
    world.nextId = Math.max(world.nextId, d.nextId);
    world.fog.explored = Uint8Array.from(d.explored, c => Number(c));
    d.ai.forEach((s, i) => world.ai.push(new AiController(world, world.players.findIndex(p => p.isAI) + i, s)));
    // Tính lại đường đi cho đơn vị đang di chuyển.
    for (const u of world.units) {
        const resume = u.resume;
        const state = u.state;
        setOrder(world, u, u.order);
        u.resume = resume;
        if (state === 'return') u.state = 'return';
    }
    world.updatePopulation();
    world.fog.update(world, 0, true);
    return world;
}

export function saveToStorage(world: World): boolean {
    try {
        localStorage.setItem(KEY, serialize(world));
        return true;
    } catch {
        return false;
    }
}

export function loadFromStorage(): World | null {
    try {
        const s = localStorage.getItem(KEY);
        return s ? deserialize(s) : null;
    } catch (e) {
        console.warn('Không tải được bản lưu:', e);
        return null;
    }
}

export function hasSave(): boolean {
    try {
        return !!localStorage.getItem(KEY);
    } catch {
        return false;
    }
}
