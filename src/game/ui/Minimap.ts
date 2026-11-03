import { TILE } from '../config/balance';
import { TERRAIN } from '../sim/GameMap';
import type { World } from '../sim/World';
import { HUMAN } from '../sim/types';

const NODE_COLORS: Record<string, string> = { tree: '#1f6b3a', gold: '#f2c84b', stone: '#b9c3c9', berry: '#e0679a', sheep: '#ffffff' };
const OWNER_COLORS = ['#3b82f6', '#ef4444'];

/** Bản đồ nhỏ: vẽ địa hình, thực thể, sương mù, khung camera. Bấm/kéo để di chuyển camera. */
export class Minimap {
    private ctx: CanvasRenderingContext2D;
    private base = document.createElement('canvas');
    private world: World | null = null;
    private pings: { x: number; y: number; t: number }[] = [];

    constructor(private canvas: HTMLCanvasElement, private onJump: (x: number, y: number) => void) {
        this.ctx = canvas.getContext('2d')!;
        let down = false;
        const jump = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            if (!this.world) return;
            const x = (e.clientX - r.left) / r.width * this.world.map.width * TILE;
            const y = (e.clientY - r.top) / r.height * this.world.map.height * TILE;
            this.onJump(x, y);
        };
        canvas.addEventListener('mousedown', e => { if (e.button === 0) { down = true; jump(e); } });
        window.addEventListener('mousemove', e => { if (down) jump(e); });
        window.addEventListener('mouseup', () => { down = false; });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    setWorld(world: World): void {
        this.world = world;
        const { width: W, height: H, terrain } = world.map;
        this.canvas.width = W * 3;
        this.canvas.height = H * 3;
        this.base.width = W;
        this.base.height = H;
        const b = this.base.getContext('2d')!;
        const img = b.createImageData(W, H);
        for (let i = 0; i < W * H; i++) {
            const t = terrain[i];
            const [r, g, bl] = t === TERRAIN.WATER ? [71, 171, 169] : t === TERRAIN.ROCK ? [120, 110, 95] : [110, 170, 80];
            img.data.set([r, g, bl, 255], i * 4);
        }
        b.putImageData(img, 0, 0);
    }

    ping(x: number, y: number): void {
        this.pings.push({ x, y, t: performance.now() });
    }

    draw(view: { x: number; y: number; width: number; height: number }): void {
        const w = this.world;
        if (!w) return;
        const ctx = this.ctx;
        const W = w.map.width, H = w.map.height;
        const sx = this.canvas.width / W, sy = this.canvas.height / H;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.base, 0, 0, this.canvas.width, this.canvas.height);
        const fog = w.fog;
        for (const n of w.nodes) {
            if (!fog.isExplored(n.tx, n.ty)) continue;
            ctx.fillStyle = NODE_COLORS[n.type];
            ctx.fillRect(n.tx * sx, n.ty * sy, sx, sy);
        }
        for (const b of w.buildings) {
            if (b.owner !== HUMAN && !fog.isExplored(b.tx, b.ty)) continue;
            ctx.fillStyle = OWNER_COLORS[b.owner];
            ctx.fillRect(b.tx * sx, b.ty * sy, b.w * sx, b.h * sy);
        }
        for (const u of w.units) {
            const tx = u.x / TILE, ty = u.y / TILE;
            if (u.owner !== HUMAN && !fog.isVisible(Math.floor(tx), Math.floor(ty))) continue;
            ctx.fillStyle = OWNER_COLORS[u.owner];
            ctx.fillRect(tx * sx - 1.5, ty * sy - 1.5, 3, 3);
        }
        // Sương mù.
        if (fog.enabled) {
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x;
                    if (fog.visible[i]) continue;
                    ctx.fillStyle = fog.explored[i] ? 'rgba(0,0,0,0.45)' : '#000';
                    ctx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
                }
            }
        }
        const now = performance.now();
        this.pings = this.pings.filter(p => now - p.t < 3000);
        for (const p of this.pings) {
            const k = ((now - p.t) % 1000) / 1000;
            ctx.strokeStyle = `rgba(255,60,60,${1 - k})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x / TILE * sx, p.y / TILE * sy, 4 + k * 14, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(view.x / TILE * sx, view.y / TILE * sy, view.width / TILE * sx, view.height / TILE * sy);
    }
}
