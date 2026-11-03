import { BUILDINGS, TILE, UNITS } from '../../config/balance';
import { HUMAN } from '../types';
import type { World } from '../World';

const UPDATE_INTERVAL = 0.2;

/** Sương mù cho người chơi: ô đã khám phá và ô đang nhìn thấy. */
export class Fog {
    explored: Uint8Array;
    visible: Uint8Array;
    /** Tăng mỗi lần cập nhật, để phần vẽ biết khi nào vẽ lại. */
    version = 0;
    enabled = true;
    private timer = 0;

    constructor(private w: number, private h: number) {
        this.explored = new Uint8Array(w * h);
        this.visible = new Uint8Array(w * h);
    }

    isVisible(tx: number, ty: number): boolean {
        if (!this.enabled) return true;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
        return this.visible[ty * this.w + tx] === 1;
    }

    isExplored(tx: number, ty: number): boolean {
        if (!this.enabled) return true;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
        return this.explored[ty * this.w + tx] === 1;
    }

    update(world: World, dt: number, force = false): void {
        this.timer -= dt;
        if (this.timer > 0 && !force) return;
        this.timer = UPDATE_INTERVAL;
        this.visible.fill(0);
        for (const u of world.units) {
            if (u.owner === HUMAN) this.reveal(u.x / TILE, u.y / TILE, UNITS[u.type].sight);
        }
        for (const b of world.buildings) {
            if (b.owner === HUMAN) this.reveal(b.tx + b.w / 2, b.ty + b.h / 2, BUILDINGS[b.type].sight + Math.max(b.w, b.h) / 2);
        }
        this.version++;
    }

    private reveal(cx: number, cy: number, r: number): void {
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
        const r2 = r * r;
        for (let y = y0; y <= y1; y++) {
            const dy = y + 0.5 - cy;
            for (let x = x0; x <= x1; x++) {
                const dx = x + 0.5 - cx;
                if (dx * dx + dy * dy > r2) continue;
                const i = y * this.w + x;
                this.visible[i] = 1;
                this.explored[i] = 1;
            }
        }
    }
}
