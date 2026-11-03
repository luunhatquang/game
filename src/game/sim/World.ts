import { BUILDINGS, BuildingType, ECONOMY, NODES, NodeType, POPULATION, RESOURCE_TYPES, ResourceType, TILE, UNITS, UnitType, Cost } from '../config/balance';
import { Difficulty } from '../config/ai';
import { GameMap } from './GameMap';
import { Pathfinder } from './Pathfinder';
import { Building, Entity, GameEvent, Player, Projectile, Rect, ResourceNode, Unit, GAIA } from './types';
import { updateUnits, separateUnits } from './systems/units';
import { updateBuildings } from './systems/production';
import { updateProjectiles } from './systems/combat';
import { Fog } from './systems/fog';
import { AiController } from './ai/AiController';

/** Số lần tìm đường A* tối đa mỗi tick. */
const PATH_BUDGET = 24;

export class World {
    map: GameMap;
    pathfinder: Pathfinder;
    entities = new Map<number, Entity>();
    units: Unit[] = [];
    buildings: Building[] = [];
    nodes: ResourceNode[] = [];
    projectiles: Projectile[] = [];
    players: Player[] = [];
    events: GameEvent[] = [];
    fog: Fog;
    ai: AiController[] = [];
    time = 0;
    nextId = 1;
    winner: number | null = null;
    lastAttackAlert = -999;
    seed: number;
    private pathQueue: number[] = [];
    private victoryTimer = 0;
    private grid = new Map<number, Unit[]>();
    private msgCooldown = new Map<string, number>();

    constructor(map: GameMap, seed: number) {
        this.map = map;
        this.seed = seed;
        this.pathfinder = new Pathfinder(map);
        this.fog = new Fog(map.width, map.height);
    }

    addPlayer(isAI: boolean, difficulty: Difficulty, resources: Record<ResourceType, number>): Player {
        const p: Player = { id: this.players.length, resources: { ...resources }, age: 1, pop: 0, popCap: 0, isAI, difficulty, defeated: false };
        this.players.push(p);
        return p;
    }

    // ---------- Tạo / xoá thực thể ----------

    spawnUnit(type: UnitType, owner: number, x: number, y: number): Unit {
        const s = UNITS[type];
        const u: Unit = {
            id: this.nextId++, kind: 'unit', type, owner, x, y, hp: s.hp, maxHp: s.hp,
            state: 'idle', order: null, resume: null, goalX: x, goalY: y, goalRect: null,
            path: [], pathIndex: 0, pathPending: false, moving: false, stuckTime: 0, repaths: 0,
            cooldown: 0, actionTime: 0, facing: 1, carryType: null, carry: 0,
            lastNodeType: null, lastNodeX: 0, lastNodeY: 0, scanTimer: Math.random() * 0.5,
        };
        this.addEntity(u);
        return u;
    }

    placeBuilding(type: BuildingType, owner: number, tx: number, ty: number, built: boolean): Building {
        const s = BUILDINGS[type];
        const b: Building = {
            id: this.nextId++, kind: 'building', type, owner, tx, ty, w: s.w, h: s.h,
            hp: built ? s.hp : Math.max(1, Math.round(s.hp * ECONOMY.foundationHpRatio)), maxHp: s.hp,
            built, progress: built ? s.buildTime : 0, queue: [], queueTime: 0, queueBlocked: false,
            rally: null, cooldown: 0, food: s.food ?? 0,
        };
        this.addEntity(b);
        return b;
    }

    addNode(type: NodeType, tx: number, ty: number, variant = 0): ResourceNode {
        const n: ResourceNode = { id: this.nextId++, kind: 'node', type, owner: GAIA, tx, ty, amount: NODES[type].amount, variant };
        this.addEntity(n);
        return n;
    }

    addEntity(e: Entity): void {
        this.entities.set(e.id, e);
        if (e.kind === 'unit') this.units.push(e);
        else if (e.kind === 'building') {
            this.buildings.push(e);
            this.map.occupy(e.tx, e.ty, e.w, e.h, e.id, !BUILDINGS[e.type].walkable);
            this.pushUnitsOut(e);
        } else {
            this.nodes.push(e);
            this.map.occupy(e.tx, e.ty, 1, 1, e.id, true);
        }
        this.nextId = Math.max(this.nextId, e.id + 1);
    }

    removeEntity(e: Entity): void {
        if (!this.entities.delete(e.id)) return;
        if (e.kind === 'unit') {
            e.state = 'dead';
            this.units.splice(this.units.indexOf(e), 1);
        } else if (e.kind === 'building') {
            this.buildings.splice(this.buildings.indexOf(e), 1);
            this.map.release(e.tx, e.ty, e.w, e.h);
        } else {
            this.nodes.splice(this.nodes.indexOf(e), 1);
            this.map.release(e.tx, e.ty, 1, 1);
        }
    }

    /** Đẩy đơn vị đứng trên nền công trình mới ra ô trống gần nhất. */
    private pushUnitsOut(b: Building): void {
        if (BUILDINGS[b.type].walkable) return;
        for (const u of this.units) {
            const tx = GameMap.toTile(u.x);
            const ty = GameMap.toTile(u.y);
            if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) {
                const p = this.map.nearestOpen(tx, ty);
                if (p) { u.x = GameMap.center(p.x); u.y = GameMap.center(p.y); }
            }
        }
    }

    get(id: number): Entity | undefined {
        return this.entities.get(id);
    }

    // ---------- Hình học ----------

    rectOf(e: Building | ResourceNode): Rect {
        const w = e.kind === 'building' ? e.w : 1;
        const h = e.kind === 'building' ? e.h : 1;
        return { x0: e.tx * TILE, y0: e.ty * TILE, x1: (e.tx + w) * TILE, y1: (e.ty + h) * TILE };
    }

    centerOf(e: Entity): { x: number; y: number } {
        if (e.kind === 'unit') return { x: e.x, y: e.y };
        const r = this.rectOf(e);
        return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    }

    /** Khoảng cách từ mép đơn vị tới mép thực thể (px). */
    distTo(u: Unit, e: Entity): number {
        const r = UNITS[u.type].radius;
        if (e.kind === 'unit') return Math.hypot(e.x - u.x, e.y - u.y) - r - UNITS[e.type].radius;
        const rc = this.rectOf(e);
        const dx = Math.max(rc.x0 - u.x, 0, u.x - rc.x1);
        const dy = Math.max(rc.y0 - u.y, 0, u.y - rc.y1);
        return Math.hypot(dx, dy) - r;
    }

    // ---------- Người chơi ----------

    canAfford(owner: number, cost: Cost): boolean {
        const res = this.players[owner].resources;
        return RESOURCE_TYPES.every(t => res[t] >= (cost[t] ?? 0));
    }

    pay(owner: number, cost: Cost): boolean {
        if (!this.canAfford(owner, cost)) return false;
        const res = this.players[owner].resources;
        for (const t of RESOURCE_TYPES) res[t] -= cost[t] ?? 0;
        return true;
    }

    refund(owner: number, cost: Cost): void {
        const res = this.players[owner].resources;
        for (const t of RESOURCE_TYPES) res[t] += cost[t] ?? 0;
    }

    missing(owner: number, cost: Cost): string {
        const res = this.players[owner].resources;
        const names: Record<ResourceType, string> = { wood: 'gỗ', food: 'thức ăn', gold: 'vàng', stone: 'đá' };
        return RESOURCE_TYPES.filter(t => res[t] < (cost[t] ?? 0))
            .map(t => `${Math.ceil((cost[t] ?? 0) - res[t])} ${names[t]}`).join(', ');
    }

    hasBuilt(owner: number, type: BuildingType): boolean {
        return this.buildings.some(b => b.owner === owner && b.type === type && b.built);
    }

    updatePopulation(): void {
        for (const p of this.players) { p.pop = 0; p.popCap = 0; }
        for (const u of this.units) if (u.owner >= 0) this.players[u.owner].pop += UNITS[u.type].pop;
        for (const b of this.buildings) {
            if (b.built && b.owner >= 0) this.players[b.owner].popCap += BUILDINGS[b.type].popBonus ?? 0;
        }
        for (const p of this.players) p.popCap = Math.min(p.popCap, POPULATION.max);
    }

    // ---------- Sự kiện ----------

    emit(e: GameEvent): void {
        this.events.push(e);
    }

    /** Thông báo có giới hạn tần suất theo khoá. */
    message(owner: number, text: string, key = text, cooldown = 4, level: 'info' | 'warn' = 'warn'): void {
        if (this.players[owner]?.isAI) return;
        const k = owner + ':' + key;
        const until = this.msgCooldown.get(k) ?? -1;
        if (this.time < until) return;
        this.msgCooldown.set(k, this.time + cooldown);
        this.emit({ type: 'message', owner, text, level });
    }

    drainEvents(): GameEvent[] {
        const ev = this.events;
        this.events = [];
        return ev;
    }

    // ---------- Tìm đường ----------

    requestPath(u: Unit): void {
        if (!u.pathPending) {
            u.pathPending = true;
            this.pathQueue.push(u.id);
        }
    }

    private processPaths(): void {
        let budget = PATH_BUDGET;
        while (budget > 0 && this.pathQueue.length) {
            const id = this.pathQueue.shift()!;
            const u = this.entities.get(id);
            if (!u || u.kind !== 'unit' || !u.pathPending) continue;
            u.pathPending = false;
            const g = u.goalRect;
            const goal = g
                ? { x0: Math.floor(g.x0 / TILE), y0: Math.floor(g.y0 / TILE), x1: Math.ceil(g.x1 / TILE) - 1, y1: Math.ceil(g.y1 / TILE) - 1 }
                : { x0: GameMap.toTile(u.goalX), y0: GameMap.toTile(u.goalY), x1: GameMap.toTile(u.goalX), y1: GameMap.toTile(u.goalY) };
            if (g) { goal.x0--; goal.y0--; goal.x1++; goal.y1++; }
            u.path = this.pathfinder.find(u.x, u.y, goal, u.goalX, u.goalY);
            u.pathIndex = 0;
            if (g) this.appendEdgePoint(u, g);
            budget--;
        }
    }

    /** Thêm điểm cuối sát mép vùng đích để đơn vị chạm được mục tiêu. */
    private appendEdgePoint(u: Unit, g: Rect): void {
        const n = u.path.length;
        const lx = n ? u.path[n - 2] : u.x;
        const ly = n ? u.path[n - 1] : u.y;
        const cx = Math.max(g.x0, Math.min(g.x1, lx));
        const cy = Math.max(g.y0, Math.min(g.y1, ly));
        const dx = lx - cx;
        const dy = ly - cy;
        const d = Math.hypot(dx, dy);
        if (d < 1) return;
        const off = UNITS[u.type].radius + 8;
        const fx = cx + dx / d * off;
        const fy = cy + dy / d * off;
        if (d > off && !this.map.isSolid(GameMap.toTile(fx), GameMap.toTile(fy))) u.path.push(fx, fy);
    }

    // ---------- Lưới không gian cho đơn vị ----------

    private rebuildGrid(): void {
        this.grid.clear();
        for (const u of this.units) {
            const k = (Math.floor(u.y / 128) << 16) | Math.floor(u.x / 128);
            let cell = this.grid.get(k);
            if (!cell) { cell = []; this.grid.set(k, cell); }
            cell.push(u);
        }
    }

    /** Đơn vị trong bán kính r quanh (x,y). */
    unitsNear(x: number, y: number, r: number, out: Unit[] = []): Unit[] {
        out.length = 0;
        const c0 = Math.floor((x - r) / 128), c1 = Math.floor((x + r) / 128);
        const r0 = Math.floor((y - r) / 128), r1 = Math.floor((y + r) / 128);
        for (let cy = r0; cy <= r1; cy++) {
            for (let cx = c0; cx <= c1; cx++) {
                const cell = this.grid.get((cy << 16) | cx);
                if (!cell) continue;
                for (const u of cell) if ((u.x - x) ** 2 + (u.y - y) ** 2 <= r * r) out.push(u);
            }
        }
        return out;
    }

    // ---------- Vòng lặp ----------

    tick(dt: number): void {
        if (this.winner !== null) return;
        this.time += dt;
        this.updatePopulation();
        this.rebuildGrid();
        this.processPaths();
        updateUnits(this, dt);
        separateUnits(this, dt);
        updateBuildings(this, dt);
        updateProjectiles(this, dt);
        for (const ai of this.ai) ai.update(dt);
        this.fog.update(this, dt);
        this.victoryTimer -= dt;
        if (this.victoryTimer <= 0) {
            this.victoryTimer = 1;
            this.checkVictory();
        }
    }

    private checkVictory(): void {
        const alive = this.players.map(p => this.buildings.some(b => b.owner === p.id));
        for (const p of this.players) p.defeated = !alive[p.id];
        const remaining = this.players.filter(p => !p.defeated);
        if (remaining.length <= 1) {
            this.winner = remaining.length ? remaining[0].id : -1;
            this.emit({ type: 'gameover', winner: this.winner });
        }
    }
}
