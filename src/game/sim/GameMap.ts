import { TILE } from '../config/balance';

export const TERRAIN = { GRASS: 0, WATER: 1, ROCK: 2 } as const;

/** Lưới bản đồ: địa hình + ô bị chiếm bởi công trình/tài nguyên. */
export class GameMap {
    readonly width: number;
    readonly height: number;
    readonly terrain: Uint8Array;
    /** id thực thể chiếm ô (0 = trống). Kể cả nông trại. */
    readonly occupant: Int32Array;
    /** 1 = không đi qua được. */
    readonly solid: Uint8Array;
    /** Tăng mỗi khi `solid` thay đổi, dùng để làm mới đường đi đã cache. */
    version = 0;

    constructor(width: number, height: number, terrain?: Uint8Array) {
        this.width = width;
        this.height = height;
        this.terrain = terrain ?? new Uint8Array(width * height);
        this.occupant = new Int32Array(width * height);
        this.solid = new Uint8Array(width * height);
        for (let i = 0; i < this.terrain.length; i++) this.solid[i] = this.terrain[i] !== TERRAIN.GRASS ? 1 : 0;
    }

    inBounds(tx: number, ty: number): boolean {
        return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
    }

    idx(tx: number, ty: number): number {
        return ty * this.width + tx;
    }

    isSolid(tx: number, ty: number): boolean {
        return !this.inBounds(tx, ty) || this.solid[this.idx(tx, ty)] === 1;
    }

    isLand(tx: number, ty: number): boolean {
        return this.inBounds(tx, ty) && this.terrain[this.idx(tx, ty)] !== TERRAIN.WATER;
    }

    /** Ô trống để đặt công trình. */
    isFree(tx: number, ty: number): boolean {
        if (!this.inBounds(tx, ty)) return false;
        const i = this.idx(tx, ty);
        return this.terrain[i] === TERRAIN.GRASS && this.occupant[i] === 0;
    }

    occupy(tx: number, ty: number, w: number, h: number, id: number, blocks: boolean): void {
        for (let y = ty; y < ty + h; y++) {
            for (let x = tx; x < tx + w; x++) {
                const i = this.idx(x, y);
                this.occupant[i] = id;
                if (blocks) this.solid[i] = 1;
            }
        }
        this.version++;
    }

    release(tx: number, ty: number, w: number, h: number): void {
        for (let y = ty; y < ty + h; y++) {
            for (let x = tx; x < tx + w; x++) {
                const i = this.idx(x, y);
                this.occupant[i] = 0;
                this.solid[i] = this.terrain[i] !== TERRAIN.GRASS ? 1 : 0;
            }
        }
        this.version++;
    }

    static toTile(px: number): number {
        return Math.floor(px / TILE);
    }

    static center(t: number): number {
        return t * TILE + TILE / 2;
    }

    /** Ô đi được gần (tx,ty) nhất, tìm theo vòng xoắn. */
    nearestOpen(tx: number, ty: number, maxR = 12): { x: number; y: number } | null {
        if (!this.isSolid(tx, ty)) return { x: tx, y: ty };
        for (let r = 1; r <= maxR; r++) {
            let best: { x: number; y: number } | null = null;
            let bestD = Infinity;
            for (let y = ty - r; y <= ty + r; y++) {
                for (let x = tx - r; x <= tx + r; x++) {
                    if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
                    if (this.isSolid(x, y)) continue;
                    const d = (x - tx) ** 2 + (y - ty) ** 2;
                    if (d < bestD) { bestD = d; best = { x, y }; }
                }
            }
            if (best) return best;
        }
        return null;
    }

    /** Đường thẳng giữa 2 điểm px có đi qua ô chặn không (dùng để làm mượt đường). */
    lineClear(x0: number, y0: number, x1: number, y1: number): boolean {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.ceil(dist / (TILE / 4));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            // Kiểm tra cả bề rộng thân đơn vị để không cắt sát góc.
            for (const [ox, oy] of OFFSETS) {
                if (this.isSolid(GameMap.toTile(x + ox), GameMap.toTile(y + oy))) return false;
            }
        }
        return true;
    }
}

const OFFSETS = [[0, 0], [12, 12], [-12, 12], [12, -12], [-12, -12]];
