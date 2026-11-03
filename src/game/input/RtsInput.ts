import * as Phaser from 'phaser';
import { BUILDINGS, BuildingType, TILE, UNITS } from '../config/balance';
import { canPlace, commandSmart, deleteEntity, placeBuilding } from '../sim/commands';
import { GameMap } from '../sim/GameMap';
import { Entity, HUMAN, Unit } from '../sim/types';
import type { World } from '../sim/World';
import type { WorldRenderer } from '../render/WorldRenderer';

const CAMERA_SPEED = 900;
const EDGE = 14;
const DRAG_THRESHOLD = 6;

export interface InputHost {
    world: World;
    renderer: WorldRenderer;
    paused: boolean;
    onSelectionChanged(): void;
    togglePause(): void;
    playSound(name: string): void;
}

/** Điều khiển kiểu RTS: camera, chọn, ra lệnh, đặt công trình, phím tắt. */
export class RtsInput {
    selection = new Set<number>();
    placing: BuildingType | null = null;
    private groups: number[][] = Array.from({ length: 10 }, () => []);
    private keys: Record<string, Phaser.Input.Keyboard.Key>;
    private dragStart: { x: number; y: number } | null = null;
    private dragging = false;
    private mouse = { x: -1, y: -1, inside: false };
    private lastClick = { t: 0, id: 0 };
    private lastGroupKey = { t: 0, n: -1 };
    private idleIndex = 0;

    constructor(private scene: Phaser.Scene, private host: InputHost) {
        const kb = scene.input.keyboard!;
        const K = Phaser.Input.Keyboard.KeyCodes;
        this.keys = kb.addKeys({
            up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT,
        }, false) as Record<string, Phaser.Input.Keyboard.Key>;

        scene.input.mouse?.disableContextMenu();
        scene.input.on('pointerdown', this.onDown, this);
        scene.input.on('pointerup', this.onUp, this);
        scene.input.on('pointermove', this.onMove, this);
        scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
            const cam = scene.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.35, 1.4));
        });
        window.addEventListener('mousemove', this.onWindowMouse);
        document.addEventListener('mouseleave', this.onWindowLeave);
        window.addEventListener('keydown', this.onKey);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    }

    destroy(): void {
        window.removeEventListener('mousemove', this.onWindowMouse);
        document.removeEventListener('mouseleave', this.onWindowLeave);
        window.removeEventListener('keydown', this.onKey);
    }

    private get world() { return this.host.world; }

    private onWindowMouse = (e: MouseEvent) => { this.mouse = { x: e.clientX, y: e.clientY, inside: true }; };
    private onWindowLeave = () => { this.mouse.inside = false; };

    update(dt: number): void {
        const cam = this.scene.cameras.main;
        let vx = 0, vy = 0;
        const k = this.keys;
        if (k.left.isDown || k.a.isDown) vx--;
        if (k.right.isDown || k.d.isDown) vx++;
        if (k.up.isDown || k.w.isDown) vy--;
        if (k.down.isDown || k.s.isDown) vy++;
        if (this.mouse.inside && document.hasFocus() && !this.dragging) {
            if (this.mouse.x <= EDGE) vx--;
            if (this.mouse.x >= window.innerWidth - EDGE) vx++;
            if (this.mouse.y <= EDGE) vy--;
            if (this.mouse.y >= window.innerHeight - EDGE) vy++;
        }
        if (vx || vy) {
            const sp = CAMERA_SPEED * dt / cam.zoom;
            cam.scrollX += Math.sign(vx) * sp;
            cam.scrollY += Math.sign(vy) * sp;
        }
        // Bỏ thực thể đã chết khỏi vùng chọn.
        let changed = false;
        for (const id of this.selection) {
            if (!this.world.entities.has(id)) { this.selection.delete(id); changed = true; }
        }
        if (changed) this.host.onSelectionChanged();
        if (this.placing) this.updatePreview();
    }

    centerOn(x: number, y: number): void {
        this.scene.cameras.main.centerOn(x, y);
    }

    // ---------- Chuột ----------

    private onDown(p: Phaser.Input.Pointer): void {
        if (p.rightButtonDown()) {
            if (this.placing) { this.cancelPlacement(); return; }
            this.rightClick(p.worldX, p.worldY);
            return;
        }
        if (!p.leftButtonDown()) return;
        if (this.placing) { this.tryPlace(); return; }
        this.dragStart = { x: p.worldX, y: p.worldY };
        this.dragging = false;
    }

    private onMove(p: Phaser.Input.Pointer): void {
        if (!this.dragStart || !p.leftButtonDown()) return;
        const cam = this.scene.cameras.main;
        if (Math.hypot(p.worldX - this.dragStart.x, p.worldY - this.dragStart.y) * cam.zoom > DRAG_THRESHOLD) this.dragging = true;
        const g = this.host.renderer.selectBox;
        g.clear();
        if (this.dragging) {
            const x = Math.min(p.worldX, this.dragStart.x), y = Math.min(p.worldY, this.dragStart.y);
            const w = Math.abs(p.worldX - this.dragStart.x), h = Math.abs(p.worldY - this.dragStart.y);
            g.fillStyle(0x22ff66, 0.12).fillRect(x, y, w, h);
            g.lineStyle(1.5 / cam.zoom, 0x22ff66, 1).strokeRect(x, y, w, h);
        }
    }

    private onUp(p: Phaser.Input.Pointer): void {
        if (!this.dragStart || !p.leftButtonReleased()) return;
        const additive = this.keys.shift.isDown;
        if (this.dragging) this.boxSelect(this.dragStart.x, this.dragStart.y, p.worldX, p.worldY, additive);
        else this.clickSelect(p.worldX, p.worldY, additive);
        this.dragStart = null;
        this.dragging = false;
        this.host.renderer.selectBox.clear();
    }

    /** Thực thể tại điểm: ưu tiên đơn vị, rồi công trình, rồi tài nguyên. */
    pick(x: number, y: number): Entity | null {
        const w = this.world;
        let best: Unit | null = null;
        let bd = Infinity;
        for (const u of w.units) {
            if (u.owner !== HUMAN && !w.fog.isVisible(GameMap.toTile(u.x), GameMap.toTile(u.y))) continue;
            const r = UNITS[u.type].radius + 10;
            // Thân đơn vị cao hơn chân: mở rộng vùng bấm lên trên.
            const d = Math.hypot(u.x - x, (u.y - 14 - y) * 0.7);
            if (d < r + 8 && d < bd) { bd = d; best = u; }
        }
        if (best) return best;
        for (const b of w.buildings) {
            if (b.owner !== HUMAN && !w.fog.isExplored(b.tx, b.ty)) continue;
            const r = w.rectOf(b);
            const top = BUILDINGS[b.type].walkable ? r.y0 : r.y0 - TILE;
            if (x >= r.x0 && x <= r.x1 && y >= top && y <= r.y1) return b;
        }
        const tx = GameMap.toTile(x), ty = GameMap.toTile(y);
        if (!w.fog.isExplored(tx, ty)) return null;
        for (const [dx, dy] of [[0, 0], [0, 1]]) {
            const occ = w.map.inBounds(tx + dx, ty + dy) ? w.get(w.map.occupant[w.map.idx(tx + dx, ty + dy)]) : undefined;
            if (occ && occ.kind === 'node') return occ;
        }
        return null;
    }

    private clickSelect(x: number, y: number, additive: boolean): void {
        const e = this.pick(x, y);
        const now = this.scene.time.now;
        // Bấm đúp: chọn mọi đơn vị cùng loại trên màn hình.
        if (e && e.kind === 'unit' && e.owner === HUMAN && this.lastClick.id === e.id && now - this.lastClick.t < 350) {
            const v = this.scene.cameras.main.worldView;
            this.setSelection(this.world.units.filter(u => u.owner === HUMAN && u.type === e.type && v.contains(u.x, u.y)).map(u => u.id));
            return;
        }
        this.lastClick = { t: now, id: e?.id ?? 0 };
        if (!e) { if (!additive) this.setSelection([]); return; }
        if (additive && e.kind === 'unit' && e.owner === HUMAN) {
            const ids = [...this.selection].filter(id => { const o = this.world.get(id); return o?.kind === 'unit' && o.owner === HUMAN; });
            if (this.selection.has(e.id)) this.setSelection(ids.filter(id => id !== e.id));
            else this.setSelection([...ids, e.id]);
            return;
        }
        this.setSelection([e.id]);
        this.host.playSound('select');
    }

    private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const ids = this.world.units.filter(u => u.owner === HUMAN && u.x >= minX && u.x <= maxX && u.y - 20 <= maxY && u.y >= minY).map(u => u.id);
        if (additive) ids.push(...[...this.selection].filter(id => this.world.get(id)?.kind === 'unit'));
        this.setSelection(ids);
        if (ids.length) this.host.playSound('select');
    }

    setSelection(ids: number[]): void {
        this.selection = new Set(ids);
        this.host.onSelectionChanged();
    }

    private rightClick(x: number, y: number): void {
        if (!this.selection.size || this.host.paused) return;
        const target = this.pick(x, y);
        const kind = commandSmart(this.world, HUMAN, [...this.selection], x, y, target);
        const colors: Record<string, number> = { move: 0x22ff66, attack: 0xff3333, gather: 0xffdd33, build: 0xffdd33, rally: 0xffffff };
        if (kind !== 'none') {
            const c = target && kind !== 'move' && kind !== 'rally' ? this.world.centerOf(target) : { x, y };
            this.host.renderer.addMarker(c.x, c.y, colors[kind]);
            this.host.playSound(kind === 'attack' ? 'attack' : 'order');
            if (kind === 'rally') this.host.onSelectionChanged();
        }
    }

    // ---------- Đặt công trình ----------

    startPlacement(type: BuildingType): void {
        this.placing = type;
        this.updatePreview();
    }

    cancelPlacement(): void {
        this.placing = null;
        this.host.renderer.showPreview(null, 0, 0, false);
    }

    private placementTile(): { tx: number; ty: number } {
        const p = this.scene.input.activePointer;
        const s = BUILDINGS[this.placing!];
        return { tx: Math.round(p.worldX / TILE - s.w / 2), ty: Math.round(p.worldY / TILE - s.h / 2) };
    }

    private updatePreview(): void {
        const { tx, ty } = this.placementTile();
        const ok = canPlace(this.world, HUMAN, this.placing!, tx, ty).ok && this.world.canAfford(HUMAN, BUILDINGS[this.placing!].cost);
        this.host.renderer.showPreview(this.placing, tx, ty, ok);
    }

    private tryPlace(): void {
        const type = this.placing!;
        const { tx, ty } = this.placementTile();
        const builders = [...this.selection].filter(id => { const e = this.world.get(id); return e?.kind === 'unit' && e.type === 'pawn' && e.owner === HUMAN; });
        const r = placeBuilding(this.world, HUMAN, type, tx, ty, builders);
        if (r.ok) {
            this.host.playSound('place');
            this.host.renderer.addMarker((tx + BUILDINGS[type].w / 2) * TILE, (ty + BUILDINGS[type].h / 2) * TILE, 0xffdd33);
            this.host.onSelectionChanged();
            if (!this.keys.shift.isDown) this.cancelPlacement();
        } else this.host.playSound('error');
    }

    // ---------- Phím tắt ----------

    private onKey = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
        if (e.code === 'Escape') {
            if (this.placing) this.cancelPlacement();
            else this.setSelection([]);
            return;
        }
        if (e.code === 'KeyP' || e.code === 'Pause') { this.host.togglePause(); return; }
        if (this.host.paused) return;
        if (e.code === 'Delete') {
            for (const id of this.selection) deleteEntity(this.world, HUMAN, id);
            this.host.onSelectionChanged();
            return;
        }
        if (e.code === 'Period') { this.selectIdlePawn(); return; }
        if (e.code === 'KeyH') {
            const c = this.world.buildings.find(b => b.owner === HUMAN && b.type === 'castle');
            if (c) { this.setSelection([c.id]); const p = this.world.centerOf(c); this.centerOn(p.x, p.y); }
            return;
        }
        const m = /^Digit([1-9])$/.exec(e.code);
        if (!m) return;
        const n = Number(m[1]);
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            e.preventDefault();
            this.groups[n] = [...this.selection].filter(id => this.world.get(id)?.owner === HUMAN);
            this.world.message(HUMAN, `Đã tạo nhóm ${n} (${this.groups[n].length})`, 'group' + n, 0.3, 'info');
            return;
        }
        const ids = this.groups[n].filter(id => this.world.entities.has(id));
        if (!ids.length) return;
        this.setSelection(ids);
        const now = performance.now();
        if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 400) {
            const c = this.world.centerOf(this.world.get(ids[0])!);
            this.centerOn(c.x, c.y);
        }
        this.lastGroupKey = { t: now, n };
    };

    /** Chọn lần lượt các pawn đang rảnh và đưa camera tới. */
    selectIdlePawn(): boolean {
        const idle = this.world.units.filter(u => u.owner === HUMAN && u.type === 'pawn' && !u.order);
        if (!idle.length) { this.world.message(HUMAN, 'Không có pawn nào đang rảnh.', 'noidle', 1, 'info'); return false; }
        const u = idle[this.idleIndex++ % idle.length];
        this.setSelection([u.id]);
        this.centerOn(u.x, u.y);
        return true;
    }
}
