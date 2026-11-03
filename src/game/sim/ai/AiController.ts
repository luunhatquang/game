import { AI_CONFIGS, AiConfig } from '../../config/ai';
import { AGE_UP, BUILDINGS, BuildingType, NODES, RESOURCE_TYPES, ResourceType, TILE, UNITS, UnitType } from '../../config/balance';
import { canPlace, checkBuildable, commandBuild, commandGather, commandMove, placeBuilding, researchAge, train } from '../commands';
import { Building, Entity, Unit } from '../types';
import type { World } from '../World';
import { findEnemyNear } from '../systems/combat';
import { resourceOf } from '../systems/economy';

export interface AiState {
    timer: number;
    nextAttack: number;
    waveSize: number;
    waves: number;
    attacking: number[];
}

/** Đối thủ máy: phát triển kinh tế, xây công trình, sinh lính và tấn công theo đợt. */
export class AiController {
    state: AiState;
    private cfg: AiConfig;

    constructor(private world: World, readonly owner: number, state?: AiState) {
        this.cfg = AI_CONFIGS[world.players[owner].difficulty];
        this.state = state ?? {
            timer: 0, nextAttack: this.cfg.firstAttackAt, waveSize: this.cfg.firstWaveSize, waves: 0, attacking: [],
        };
    }

    update(dt: number): void {
        this.state.timer -= dt;
        if (this.state.timer > 0) return;
        this.state.timer = this.cfg.thinkInterval;
        if (this.world.players[this.owner].defeated) return;
        this.think();
    }

    private get me() { return this.world.players[this.owner]; }

    private think(): void {
        const w = this.world;
        const units = w.units.filter(u => u.owner === this.owner);
        const pawns = units.filter(u => u.type === 'pawn');
        const army = units.filter(u => u.type !== 'pawn');
        const mine = w.buildings.filter(b => b.owner === this.owner);
        const castle = mine.find(b => b.type === 'castle' && b.built) ?? mine[0];
        if (!castle) return;
        const has = (t: BuildingType, builtOnly = false) => mine.some(b => b.type === t && (!builtOnly || b.built));
        const count = (t: BuildingType) => mine.filter(b => b.type === t).length;

        this.assignBuilders(pawns, mine);

        // Sinh pawn.
        if (castle.type === 'castle' && castle.built && pawns.length + castle.queue.filter(q => q.unit === 'pawn').length < this.cfg.maxPawns
            && castle.queue.length < 2 && !this.savingForAge(pawns.length)) {
            train(w, this.owner, castle.id, 'pawn');
        }

        // Nhà dân khi sắp hết dân.
        const queued = mine.reduce((n, b) => n + b.queue.filter(q => q.kind === 'unit').length, 0);
        const housing = mine.some(b => b.type === 'house' && !b.built);
        if (!housing && this.me.popCap < 200 && this.me.pop + queued + 3 >= this.me.popCap) {
            this.build('house', castle, pawns, 3, 9);
        }

        // Công trình nhận tài nguyên gần nguồn.
        if (pawns.length >= 5 && !has('lumberCamp')) this.buildNearResource('lumberCamp', 'tree', castle, pawns);
        if (pawns.length >= 7 && !has('mill')) {
            if (!this.buildNearResource('mill', 'berry', castle, pawns)) this.build('mill', castle, pawns, 3, 8);
        }
        if (pawns.length >= 9 && !has('miningCamp')) this.buildNearResource('miningCamp', 'gold', castle, pawns);
        if (pawns.length >= 8 && !has('barracks')) this.build('barracks', castle, pawns, 4, 10);

        // Nông trại khi hết bụi quả / cừu gần nhà.
        if (has('mill', true) && count('farm') < this.cfg.maxFarms && !mine.some(b => b.type === 'farm' && !b.built)) {
            const c = w.centerOf(castle);
            const wild = w.nodes.some(n => NODES[n.type].resource === 'food' && Math.hypot(w.centerOf(n).x - c.x, w.centerOf(n).y - c.y) < 14 * TILE);
            const foodPawns = pawns.filter(p => this.pawnResource(p) === 'food').length;
            if (!wild || count('farm') < foodPawns - 3) this.build('farm', castle, pawns, 3, 8);
        }

        // Lên đời.
        if (this.me.age === 1 && pawns.length >= this.cfg.ageUpPawns && has('barracks', true) && w.canAfford(this.owner, AGE_UP.cost)) {
            researchAge(w, this.owner, castle.id);
        }
        if (this.me.age >= 2) {
            if (!has('archery')) this.build('archery', castle, pawns, 4, 11);
            else if (!has('stable')) this.build('stable', castle, pawns, 4, 11);
            else if (count('tower') < this.cfg.maxTowers) this.build('tower', castle, pawns, 4, 7);
        }

        this.trainArmy(mine, pawns.length);
        this.allocateGatherers(pawns, castle);
        this.handleArmy(army, castle);
    }

    /** Để dành tài nguyên lên đời khi đủ dân. */
    private savingForAge(pawnCount: number): boolean {
        return this.me.age === 1 && pawnCount >= this.cfg.ageUpPawns && !this.world.canAfford(this.owner, AGE_UP.cost);
    }

    private pawnResource(u: Unit): ResourceType | null {
        if (u.order?.type !== 'gather') return null;
        return u.carryType ?? resourceOf(this.world.get(u.order.target));
    }

    /** Chọn pawn gần nhất không đang xây. */
    private pickBuilder(pawns: Unit[], x: number, y: number): Unit | null {
        let best: Unit | null = null;
        let bd = Infinity;
        for (const p of pawns) {
            if (p.order?.type === 'build') continue;
            const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.carry > 5 ? 1e6 : 0);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }

    private build(type: BuildingType, near: Entity, pawns: Unit[], dMin: number, dMax: number): Building | null {
        if (!checkBuildable(this.world, this.owner, type).ok) return null;
        const c = this.world.centerOf(near);
        const spot = this.findSpot(type, c.x / TILE, c.y / TILE, dMin, dMax);
        if (!spot) return null;
        const builder = this.pickBuilder(pawns, spot.x * TILE, spot.y * TILE);
        if (!builder) return null;
        const r = placeBuilding(this.world, this.owner, type, spot.x, spot.y, [builder.id]);
        return r.building ?? null;
    }

    private buildNearResource(type: BuildingType, node: 'tree' | 'gold' | 'berry', castle: Building, pawns: Unit[]): boolean {
        const c = this.world.centerOf(castle);
        let best: Entity | null = null;
        let bd = Infinity;
        for (const n of this.world.nodes) {
            if (n.type !== node) continue;
            const d = Math.hypot(n.tx * TILE - c.x, n.ty * TILE - c.y);
            if (d < bd) { bd = d; best = n; }
        }
        if (!best || bd > 20 * TILE) return false;
        // Gần nhà chính rồi thì không cần trại riêng.
        if (bd < 6 * TILE && type !== 'mill') return false;
        if (!checkBuildable(this.world, this.owner, type).ok) return false;
        const p = this.world.centerOf(best);
        const spot = this.findSpot(type, p.x / TILE, p.y / TILE, 1, 5);
        if (!spot) return false;
        const builder = this.pickBuilder(pawns, spot.x * TILE, spot.y * TILE);
        if (!builder) return false;
        return placeBuilding(this.world, this.owner, type, spot.x, spot.y, [builder.id]).ok;
    }

    /** Tìm chỗ đặt có chừa 1 ô trống xung quanh để không chặn đường. */
    private findSpot(type: BuildingType, cx: number, cy: number, dMin: number, dMax: number): { x: number; y: number } | null {
        const s = BUILDINGS[type];
        const map = this.world.map;
        const cands: { x: number; y: number; d: number }[] = [];
        for (let y = Math.floor(cy - dMax); y <= cy + dMax; y++) {
            for (let x = Math.floor(cx - dMax); x <= cx + dMax; x++) {
                const d = Math.hypot(x + s.w / 2 - cx, y + s.h / 2 - cy);
                if (d < dMin || d > dMax) continue;
                cands.push({ x, y, d: d + Math.random() * 2 });
            }
        }
        cands.sort((a, b) => a.d - b.d);
        for (const c of cands) {
            if (!canPlace(this.world, this.owner, type, c.x, c.y).ok) continue;
            let clear = true;
            for (let y = c.y - 1; y <= c.y + s.h && clear; y++) {
                for (let x = c.x - 1; x <= c.x + s.w; x++) {
                    const edge = x === c.x - 1 || x === c.x + s.w || y === c.y - 1 || y === c.y + s.h;
                    if (edge && map.isSolid(x, y) && !(type === 'farm' && map.isLand(x, y))) { clear = false; break; }
                }
            }
            if (clear) return c;
        }
        return null;
    }

    /** Công trình đang xây không có ai xây: gọi pawn gần nhất. */
    private assignBuilders(pawns: Unit[], mine: Building[]): void {
        for (const b of mine) {
            if (b.built) continue;
            if (pawns.some(p => p.order?.type === 'build' && p.order.target === b.id)) continue;
            const c = this.world.centerOf(b);
            const p = this.pickBuilder(pawns, c.x, c.y);
            if (p) commandBuild(this.world, this.owner, [p.id], b.id);
        }
    }

    private allocateGatherers(pawns: Unit[], castle: Building): void {
        const counts: Record<ResourceType, number> = { wood: 0, food: 0, gold: 0, stone: 0 };
        for (const p of pawns) { const r = this.pawnResource(p); if (r) counts[r]++; }
        const total = pawns.length;
        const weights = { ...this.cfg.gatherWeights };
        // Thiếu loại nào nhiều thì tăng trọng số loại đó.
        const res = this.me.resources;
        if (res.wood < 100) weights.wood += 0.1;
        if (this.me.age === 1 && pawns.length >= this.cfg.ageUpPawns) { weights.food += 0.1; weights.gold += 0.05; }
        const deficit = (r: ResourceType) => weights[r] * total - counts[r];
        const idle = pawns.filter(p => !p.order);
        // Cân bằng lại: chuyển 1 pawn từ loại thừa nhiều sang loại thiếu.
        const sorted = [...RESOURCE_TYPES].sort((a, b) => deficit(b) - deficit(a));
        if (!idle.length && deficit(sorted[0]) >= 1.5 && deficit(sorted[3]) <= -1.5) {
            const p = pawns.find(u => this.pawnResource(u) === sorted[3] && u.carry < 2);
            if (p) idle.push(p);
        }
        for (const p of idle) {
            const order = [...RESOURCE_TYPES].sort((a, b) => deficit(b) - deficit(a));
            for (const r of order) {
                const src = this.nearestSource(r, p, castle);
                if (src) {
                    commandGather(this.world, this.owner, [p.id], src.id);
                    counts[r]++;
                    break;
                }
            }
        }
    }

    private nearestSource(r: ResourceType, p: Unit, castle: Building): Entity | null {
        const w = this.world;
        const c = w.centerOf(castle);
        let best: Entity | null = null;
        let bd = Infinity;
        for (const n of w.nodes) {
            if (NODES[n.type].resource !== r) continue;
            const nc = w.centerOf(n);
            // Ưu tiên nguồn gần căn cứ để không đi quá xa.
            const d = Math.hypot(nc.x - p.x, nc.y - p.y) + Math.hypot(nc.x - c.x, nc.y - c.y) * 0.5;
            if (d < bd) { bd = d; best = n; }
        }
        if (r === 'food') {
            for (const b of w.buildings) {
                if (b.type !== 'farm' || b.owner !== this.owner || !b.built) continue;
                if (w.units.some(u => u.order?.type === 'gather' && u.order.target === b.id)) continue;
                const bc = w.centerOf(b);
                const d = Math.hypot(bc.x - p.x, bc.y - p.y);
                if (d < bd) { bd = d; best = b; }
            }
        }
        return best;
    }

    private trainArmy(mine: Building[], pawnCount: number): void {
        if (this.savingForAge(pawnCount)) return;
        // Giữ lại tài nguyên cho pawn khi kinh tế còn yếu.
        const ecoFirst = pawnCount < Math.min(10, this.cfg.maxPawns);
        for (const b of mine) {
            const trains = BUILDINGS[b.type].trains;
            if (!b.built || !trains || b.type === 'castle' || b.queue.length >= 2) continue;
            if (ecoFirst && b.queue.length >= 1) continue;
            const unit: UnitType = trains[0];
            const cost = UNITS[unit].cost;
            if (ecoFirst && (this.me.resources.food ?? 0) < (cost.food ?? 0) + 60) continue;
            train(this.world, this.owner, b.id, unit);
        }
    }

    private handleArmy(army: Unit[], castle: Building): void {
        const w = this.world;
        const s = this.state;
        s.attacking = s.attacking.filter(id => w.entities.has(id));
        const home = w.centerOf(castle);

        // Phòng thủ: địch gần căn cứ thì đem quân rảnh ra đánh.
        const threat = findEnemyNear(w, { x: home.x, y: home.y, owner: this.owner }, 14 * TILE, false);
        if (threat) {
            const free = army.filter(u => !s.attacking.includes(u.id) && u.order?.type !== 'attack');
            if (free.length) commandMove(w, this.owner, free.map(u => u.id), threat.kind === 'unit' ? threat.x : home.x, threat.kind === 'unit' ? threat.y : home.y, true);
        }

        const target = this.enemyTarget(home.x, home.y);
        if (!target) return;
        // Đang tấn công: quân rảnh tiếp tục đánh công trình địch gần nhất.
        if (s.attacking.length) {
            for (const id of s.attacking) {
                const u = w.get(id) as Unit;
                if (!u.order) {
                    const t = this.enemyTarget(u.x, u.y) ?? target;
                    commandMove(w, this.owner, [u.id], t.x, t.y, true);
                }
            }
            return;
        }
        // Tập trung quân trước nhà chính phía đối thủ.
        const dir = Math.atan2(target.y - home.y, target.x - home.x);
        const rx = home.x + Math.cos(dir) * 5 * TILE, ry = home.y + Math.sin(dir) * 5 * TILE;
        const idle = army.filter(u => !u.order);
        const far = idle.filter(u => Math.hypot(u.x - rx, u.y - ry) > 4 * TILE);
        if (far.length) commandMove(w, this.owner, far.map(u => u.id), rx, ry);

        if (w.time >= s.nextAttack && army.length >= s.waveSize) {
            s.attacking = army.map(u => u.id);
            commandMove(w, this.owner, s.attacking, target.x, target.y, true);
            s.waves++;
            s.waveSize = Math.min(this.cfg.maxWaveSize, this.cfg.firstWaveSize + this.cfg.waveGrowth * s.waves);
            s.nextAttack = w.time + this.cfg.waveInterval;
            w.message(0, 'Quân địch đang tiến đến!', 'ai-wave', 5);
        }
    }

    /** Công trình địch gần điểm (x,y) nhất. */
    private enemyTarget(x: number, y: number): { x: number; y: number } | null {
        let best: { x: number; y: number } | null = null;
        let bd = Infinity;
        for (const b of this.world.buildings) {
            if (b.owner === this.owner || b.owner < 0) continue;
            const c = this.world.centerOf(b);
            const d = Math.hypot(c.x - x, c.y - y);
            if (d < bd) { bd = d; best = c; }
        }
        return best;
    }
}
