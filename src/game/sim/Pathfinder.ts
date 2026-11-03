import { TILE } from '../config/balance';
import { GameMap } from './GameMap';

/** Vùng đích theo ô (bao gồm 2 đầu). Đích đạt khi ô nằm trong vùng. */
export interface TileGoal { x0: number; y0: number; x1: number; y1: number }

const SQRT2 = Math.SQRT2;
const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * A* trên lưới 8 hướng, không cắt góc.
 * Mảng đệm dùng lại giữa các lần tìm; số lần tìm mỗi tick do World giới hạn.
 */
export class Pathfinder {
    private g: Float32Array;
    private parent: Int32Array;
    private stamp: Uint32Array;
    private closed: Uint32Array;
    private heap: Int32Array;
    private heapF: Float32Array;
    private heapSize = 0;
    private run = 0;
    /** Số lần tìm đường đã chạy (thống kê). */
    searches = 0;

    constructor(private map: GameMap) {
        const n = map.width * map.height;
        this.g = new Float32Array(n);
        this.parent = new Int32Array(n);
        this.stamp = new Uint32Array(n);
        this.closed = new Uint32Array(n);
        this.heap = new Int32Array(n * 8);
        this.heapF = new Float32Array(n * 8);
    }

    /**
     * Trả về danh sách điểm px [x0,y0,x1,y1,...] từ sau điểm xuất phát.
     * Nếu không tới được đích thì đi tới ô gần đích nhất.
     */
    find(sx: number, sy: number, goal: TileGoal, endX: number, endY: number): number[] {
        this.searches++;
        const map = this.map;
        const W = map.width;
        const stx = Math.max(0, Math.min(W - 1, GameMap.toTile(sx)));
        const sty = Math.max(0, Math.min(map.height - 1, GameMap.toTile(sy)));
        const run = ++this.run;
        const start = sty * W + stx;
        this.heapSize = 0;
        this.g[start] = 0;
        this.parent[start] = -1;
        this.stamp[start] = run;
        this.push(start, this.h(stx, sty, goal));

        let best = start;
        let bestH = this.h(stx, sty, goal);
        let found = -1;
        let expanded = 0;

        while (this.heapSize > 0) {
            const cur = this.pop();
            if (this.closed[cur] === run) continue;
            this.closed[cur] = run;
            const cx = cur % W;
            const cy = (cur - cx) / W;
            if (cx >= goal.x0 && cx <= goal.x1 && cy >= goal.y0 && cy <= goal.y1) {
                found = cur;
                break;
            }
            const hc = this.h(cx, cy, goal);
            if (hc < bestH) { bestH = hc; best = cur; }
            if (++expanded > 6000) break;

            for (const [dx, dy, cost] of DIRS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (map.isSolid(nx, ny)) continue;
                if (dx !== 0 && dy !== 0 && (map.isSolid(cx + dx, cy) || map.isSolid(cx, cy + dy))) continue;
                const ni = ny * W + nx;
                if (this.closed[ni] === run) continue;
                const ng = this.g[cur] + cost;
                if (this.stamp[ni] === run && ng >= this.g[ni]) continue;
                this.stamp[ni] = run;
                this.g[ni] = ng;
                this.parent[ni] = cur;
                this.push(ni, ng + this.h(nx, ny, goal));
            }
        }

        const end = found >= 0 ? found : best;
        const tiles: number[] = [];
        for (let c = end; c !== -1 && c !== start; c = this.parent[c]) tiles.push(c);
        tiles.reverse();

        const pts: number[] = [];
        for (const t of tiles) {
            const tx = t % W;
            pts.push(tx * TILE + TILE / 2, ((t - tx) / W) * TILE + TILE / 2);
        }
        // Nếu đích là điểm cụ thể và tới được, đi đúng tới điểm đó.
        if (found >= 0 && GameMap.toTile(endX) === end % W && GameMap.toTile(endY) === Math.floor(end / W)) {
            if (pts.length) { pts[pts.length - 2] = endX; pts[pts.length - 1] = endY; }
            else pts.push(endX, endY);
        }
        return this.smooth(sx, sy, pts);
    }

    /** Bỏ các điểm trung gian khi có đường thẳng thông. */
    private smooth(sx: number, sy: number, pts: number[]): number[] {
        if (pts.length <= 2) return pts;
        const out: number[] = [];
        let ax = sx;
        let ay = sy;
        let i = 0;
        const n = pts.length / 2;
        while (i < n) {
            let j = n - 1;
            while (j > i && !this.map.lineClear(ax, ay, pts[j * 2], pts[j * 2 + 1])) j--;
            out.push(pts[j * 2], pts[j * 2 + 1]);
            ax = pts[j * 2];
            ay = pts[j * 2 + 1];
            i = j + 1;
        }
        return out;
    }

    private h(x: number, y: number, g: TileGoal): number {
        const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0;
        const dy = y < g.y0 ? g.y0 - y : y > g.y1 ? y - g.y1 : 0;
        return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    }

    private push(node: number, f: number): void {
        let i = this.heapSize++;
        const heap = this.heap;
        const hf = this.heapF;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (hf[p] <= f) break;
            heap[i] = heap[p];
            hf[i] = hf[p];
            i = p;
        }
        heap[i] = node;
        hf[i] = f;
    }

    private pop(): number {
        const heap = this.heap;
        const hf = this.heapF;
        const top = heap[0];
        const n = --this.heapSize;
        const last = heap[n];
        const lf = hf[n];
        let i = 0;
        while (true) {
            let c = i * 2 + 1;
            if (c >= n) break;
            if (c + 1 < n && hf[c + 1] < hf[c]) c++;
            if (hf[c] >= lf) break;
            heap[i] = heap[c];
            hf[i] = hf[c];
            i = c;
        }
        heap[i] = last;
        hf[i] = lf;
        return top;
    }
}
