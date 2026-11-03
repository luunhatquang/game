import * as Phaser from 'phaser';
import { BUILDINGS, BuildingType, NODES, TILE, UNITS } from '../config/balance';
import { GameMap, TERRAIN } from '../sim/GameMap';
import { World } from '../sim/World';
import { Building, Entity, GameEvent, HUMAN, ResourceNode, Unit } from '../sim/types';
import { BUILDING_SPRITES, NODE_SPRITES, PLAYER_COLORS, PLAYER_TINT, UNIT_SPRITES, buildingKey, unitAnimKey } from './assets';

const D_TERRAIN = 0;
const D_GROUND_FX = 5;
const D_OVERLAY = 1_000_000;
const D_FOG = 2_000_000;
const WATER_COLOR = 0x47aba9;

interface UnitView { kind: 'unit'; sprite: Phaser.GameObjects.Sprite; anim: string }
interface BuildingView {
    kind: 'building';
    image?: Phaser.GameObjects.Image;
    gfx?: Phaser.GameObjects.Graphics;
    badge?: Phaser.GameObjects.Image;
    label?: Phaser.GameObjects.Text;
    fires: Phaser.GameObjects.Sprite[];
    built: boolean;
    progressShown: number;
}
interface NodeView { kind: 'node'; sprite: Phaser.GameObjects.Sprite }
type View = UnitView | BuildingView | NodeView;

interface Marker { x: number; y: number; t: number; color: number }

/** Vẽ thế giới mô phỏng bằng Phaser. Không thay đổi trạng thái mô phỏng. */
export class WorldRenderer {
    private views = new Map<number, View>();
    private terrainObjs: Phaser.GameObjects.GameObject[] = [];
    private ground: Phaser.GameObjects.Graphics;
    private overlay: Phaser.GameObjects.Graphics;
    private arrows: Phaser.GameObjects.Image[] = [];
    private markers: Marker[] = [];
    private fogTex!: Phaser.Textures.CanvasTexture;
    private fogImage!: Phaser.GameObjects.Image;
    private fogVersion = -1;
    private fogData!: ImageData;
    private preview: Phaser.GameObjects.Image;
    private previewGfx: Phaser.GameObjects.Graphics;
    selectBox: Phaser.GameObjects.Graphics;

    constructor(private scene: Phaser.Scene, private world: World) {
        this.ground = scene.add.graphics().setDepth(D_GROUND_FX);
        this.overlay = scene.add.graphics().setDepth(D_OVERLAY);
        this.selectBox = scene.add.graphics().setDepth(D_FOG + 10);
        this.previewGfx = scene.add.graphics().setDepth(D_OVERLAY - 1);
        this.preview = scene.add.image(0, 0, 'tiles', 0).setVisible(false).setAlpha(0.6).setDepth(D_OVERLAY - 1);
        this.buildTerrain();
    }

    setWorld(world: World): void {
        for (const v of this.views.values()) this.destroyView(v);
        this.views.clear();
        for (const o of this.terrainObjs) o.destroy();
        this.terrainObjs = [];
        this.fogImage.destroy();
        this.scene.textures.remove('fog');
        this.world = world;
        this.fogVersion = -1;
        this.buildTerrain();
    }

    // ---------- Địa hình ----------

    private buildTerrain(): void {
        const map = this.world.map;
        const W = map.width, H = map.height;
        this.scene.cameras.main.setBackgroundColor(WATER_COLOR);
        const tm = this.scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: H });
        const ts = tm.addTilesetImage('tiles')!;
        const flat = tm.createBlankLayer('flat', ts)!.setDepth(D_TERRAIN + 1);
        const high = tm.createBlankLayer('high', ts)!.setDepth(D_TERRAIN + 2);
        this.terrainObjs.push(flat, high);

        const land = (x: number, y: number) => map.isLand(x, y);
        const rock = (x: number, y: number) => map.inBounds(x, y) && map.terrain[map.idx(x, y)] === TERRAIN.ROCK;
        // Mặt cao nguyên = ô đá trừ hàng dưới cùng (hàng dưới là vách đá).
        const top = (x: number, y: number) => rock(x, y) && rock(x, y + 1);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (land(x, y)) {
                    flat.putTileAt(autoTile(land, x, y, 0), x, y);
                    if (isCoast(map, x, y)) {
                        const f = this.scene.add.sprite(GameMap.center(x), GameMap.center(y), 'foam').setDepth(D_TERRAIN).play({ key: 'foam', startFrame: (x * 7 + y * 3) % 16 });
                        this.terrainObjs.push(f);
                    }
                }
                if (top(x, y)) high.putTileAt(autoTile(top, x, y, 5), x, y);
                else if (rock(x, y)) {
                    const l = rock(x - 1, y) && !rock(x - 1, y + 1), r = rock(x + 1, y) && !rock(x + 1, y + 1);
                    high.putTileAt(!l && !r ? 44 : !l ? 41 : !r ? 43 : 42, x, y);
                }
            }
        }

        const tex = this.scene.textures.createCanvas('fog', W, H)!;
        this.fogTex = tex;
        this.fogData = tex.context.createImageData(W, H);
        this.fogImage = this.scene.add.image(0, 0, 'fog').setOrigin(0, 0).setScale(TILE).setDepth(D_FOG);
        tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
        this.scene.cameras.main.setBounds(-TILE * 2, -TILE * 2, W * TILE + TILE * 4, H * TILE + TILE * 6);
    }

    private updateFog(): void {
        const fog = this.world.fog;
        if (fog.version === this.fogVersion) return;
        this.fogVersion = fog.version;
        const d = this.fogData.data;
        const n = fog.explored.length;
        for (let i = 0; i < n; i++) {
            d[i * 4 + 3] = !fog.enabled || fog.visible[i] ? 0 : fog.explored[i] ? 130 : 255;
        }
        this.fogTex.context.putImageData(this.fogData, 0, 0);
        this.fogTex.refresh();
    }

    // ---------- Đồng bộ thực thể ----------

    sync(dt: number, selected: ReadonlySet<number>): void {
        const world = this.world;
        for (const [id, v] of this.views) {
            if (!world.entities.has(id)) { this.destroyView(v); this.views.delete(id); }
        }
        for (const e of world.entities.values()) {
            let v = this.views.get(e.id);
            if (!v) { v = this.createView(e); this.views.set(e.id, v); }
            if (e.kind === 'unit') this.updateUnit(e, v as UnitView);
            else if (e.kind === 'building') this.updateBuilding(e, v as BuildingView);
            else this.updateNode(e, v as NodeView);
        }
        this.updateArrows();
        this.updateFog();
        this.drawOverlays(dt, selected);
    }

    private createView(e: Entity): View {
        const s = this.scene;
        if (e.kind === 'unit') {
            const sp = UNIT_SPRITES[e.type];
            const sprite = s.add.sprite(e.x, e.y, `${PLAYER_COLORS[e.owner]}-${sp.anims.idle.file}`)
                .setScale(sp.scale).setOrigin(0.5, sp.originY);
            return { kind: 'unit', sprite, anim: '' };
        }
        if (e.kind === 'node') {
            const ns = NODE_SPRITES[e.type];
            const key = ns.keys[e.variant % ns.keys.length];
            const sprite = s.add.sprite(GameMap.center(e.tx), (e.ty + 1) * TILE - 12, key)
                .setScale(ns.scale).setOrigin(0.5, ns.originY).setDepth((e.ty + 1) * TILE - 12);
            if (e.type === 'tree') sprite.setFrame((e.tx * 3 + e.ty * 5) % 8).setY((e.ty + 1) * TILE - 6);
            if (e.type === 'sheep') { sprite.play({ key: 'sheep', startFrame: e.id % 6 }); sprite.setFlipX(e.id % 2 === 0); }
            return { kind: 'node', sprite };
        }
        return this.createBuilding(e);
    }

    private createBuilding(b: Building): BuildingView {
        const s = this.scene;
        const conf = BUILDING_SPRITES[b.type];
        const color = PLAYER_COLORS[b.owner];
        const cx = (b.tx + b.w / 2) * TILE;
        const bottom = (b.ty + b.h) * TILE;
        const v: BuildingView = { kind: 'building', fires: [], built: b.built, progressShown: -1 };
        if (conf.file) {
            const img = s.add.image(cx, bottom + 8, buildingKey(color, b.type)).setOrigin(0.5, 1);
            const scale = Math.min(1.1, (b.w * TILE + 24) / img.width);
            img.setScale(scale).setDepth(bottom);
            v.image = img;
        } else {
            // Placeholder: nông trại = ruộng đất có luống.
            const g = s.add.graphics().setDepth(D_GROUND_FX - 1);
            const x0 = b.tx * TILE + 4, y0 = b.ty * TILE + 4, w = b.w * TILE - 8, h = b.h * TILE - 8;
            g.fillStyle(0x8b5a2b, 1).fillRect(x0, y0, w, h);
            g.lineStyle(3, 0x6b4220, 1);
            for (let y = y0 + 10; y < y0 + h; y += 14) g.lineBetween(x0 + 4, y, x0 + w - 4, y);
            g.lineStyle(3, PLAYER_TINT[b.owner], 1).strokeRect(x0, y0, w, h);
            v.gfx = g;
        }
        if (conf.badge) {
            v.badge = s.add.image(cx + b.w * TILE * 0.32, bottom - 18, conf.badge).setScale(0.5).setDepth(bottom + 1);
        }
        if (conf.label) {
            v.label = s.add.text(cx, bottom + 4, BUILDINGS[b.type].name, {
                fontFamily: 'sans-serif', fontSize: '13px', color: '#fff', backgroundColor: '#0008', padding: { x: 3, y: 1 },
            }).setOrigin(0.5, 0).setDepth(bottom + 2);
        }
        return v;
    }

    private updateUnit(u: Unit, v: UnitView): void {
        const sp = v.sprite;
        sp.setPosition(u.x, u.y).setDepth(u.y);
        const visible = u.owner === HUMAN || this.world.fog.isVisible(GameMap.toTile(u.x), GameMap.toTile(u.y));
        sp.setVisible(visible);
        if (!visible) return;
        const anim = this.unitAnim(u);
        const key = unitAnimKey(PLAYER_COLORS[u.owner], u.type, anim.name);
        if (v.anim !== key) { sp.play(key); v.anim = key; }
        sp.setFlipX(anim.flip ?? u.facing < 0);
    }

    private unitAnim(u: Unit): { name: string; flip?: boolean } {
        const carry = u.carry > 0 && u.carryType ? (u.carryType === 'stone' ? 'gold' : u.carryType) : null;
        if (u.moving) return { name: u.type === 'pawn' && carry ? `run_${carry}` : 'run' };
        if (u.actionTime > 0) {
            if (u.state === 'build') return { name: 'build' };
            if (u.state === 'gather' && u.type === 'pawn' && u.carryType) {
                return { name: `work_${u.carryType === 'stone' ? 'gold' : u.carryType}` };
            }
            if (u.state === 'attack') {
                if (u.type === 'cavalry' && u.order?.type === 'attack') {
                    const t = this.world.get(u.order.target);
                    if (t) {
                        const c = this.world.centerOf(t);
                        const ang = Math.atan2(c.y - u.y, Math.abs(c.x - u.x));
                        const dir = ang < -1.1 ? 'attack_up' : ang < -0.4 ? 'attack_upright' : ang > 1.1 ? 'attack_down' : ang > 0.4 ? 'attack_downright' : 'attack';
                        return { name: dir, flip: c.x < u.x };
                    }
                }
                return { name: 'attack' };
            }
        }
        if (u.type === 'pawn' && carry) return { name: `idle_${carry}` };
        return { name: 'idle' };
    }

    private updateBuilding(b: Building, v: BuildingView): void {
        const s = BUILDINGS[b.type];
        if (v.image) {
            const ratio = b.built ? 1 : Math.max(0.15, b.progress / s.buildTime);
            if (Math.abs(ratio - v.progressShown) > 0.01) {
                v.progressShown = ratio;
                const h = v.image.height;
                v.image.setCrop(0, h * (1 - ratio), v.image.width, h * ratio);
                v.image.setAlpha(b.built ? 1 : 0.75);
            }
        } else if (v.gfx) {
            v.gfx.setAlpha(b.built ? 1 : 0.5);
        }
        // Hư hại: thêm lửa khi máu thấp.
        const fires = b.built ? (b.hp < b.maxHp * 0.33 ? 2 : b.hp < b.maxHp * 0.66 ? 1 : 0) : 0;
        while (v.fires.length < fires) {
            const i = v.fires.length;
            const f = this.scene.add.sprite((b.tx + b.w * (0.3 + 0.4 * i)) * TILE, (b.ty + b.h * 0.6) * TILE, 'fire')
                .setScale(0.6).setDepth((b.ty + b.h) * TILE + 3).play({ key: 'fire', startFrame: i * 3 });
            v.fires.push(f);
        }
        while (v.fires.length > fires) v.fires.pop()!.destroy();
    }

    private updateNode(n: ResourceNode, v: NodeView): void {
        // Nguồn gần cạn thì nhỏ lại một chút.
        const ratio = n.amount / NODES[n.type].amount;
        const base = NODE_SPRITES[n.type].scale;
        v.sprite.setScale(base * (0.75 + 0.25 * ratio));
    }

    private destroyView(v: View): void {
        if (v.kind === 'unit' || v.kind === 'node') { v.sprite.destroy(); return; }
        v.image?.destroy(); v.gfx?.destroy(); v.badge?.destroy(); v.label?.destroy();
        for (const f of v.fires) f.destroy();
    }

    private updateArrows(): void {
        const ps = this.world.projectiles;
        while (this.arrows.length < ps.length) this.arrows.push(this.scene.add.image(0, 0, 'arrow').setScale(0.6).setDepth(D_OVERLAY - 2));
        this.arrows.forEach((a, i) => {
            const p = ps[i];
            if (!p) { a.setVisible(false); return; }
            // Đường cong nhẹ cho mũi tên.
            const total = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1;
            const done = Math.hypot(p.x - p.sx, p.y - p.sy) / total;
            const arc = Math.sin(Math.min(1, done) * Math.PI) * Math.min(60, total * 0.15);
            const vis = p.owner === HUMAN || this.world.fog.isVisible(GameMap.toTile(p.x), GameMap.toTile(p.y));
            a.setVisible(vis).setPosition(p.x, p.y - arc).setRotation(Math.atan2(p.ty - p.y, p.tx - p.x) - (done < 0.5 ? 0.3 : -0.3) * Math.sign(p.tx - p.x || 1));
        });
    }

    // ---------- Hiệu ứng từ sự kiện ----------

    handleEvents(events: GameEvent[]): void {
        for (const e of events) {
            if (e.type === 'death' && this.isVisiblePx(e.x, e.y, e.owner)) {
                const d = this.scene.add.sprite(e.x, e.y, 'dead').setScale(0.6).setDepth(e.y - 1).play('dead');
                d.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => d.destroy());
            } else if (e.type === 'destroyed' && this.isVisiblePx(e.x, e.y, e.owner)) {
                const x = this.scene.add.sprite(e.x, e.y, 'explosion').setDepth(e.y + 200).play('explosion');
                x.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => x.destroy());
            }
        }
    }

    private isVisiblePx(x: number, y: number, owner: number): boolean {
        return owner === HUMAN || this.world.fog.isVisible(GameMap.toTile(x), GameMap.toTile(y));
    }

    addMarker(x: number, y: number, color: number): void {
        this.markers.push({ x, y, t: 0, color });
    }

    // ---------- Lớp phủ: vòng chọn, thanh máu, tiến độ ----------

    private drawOverlays(dt: number, selected: ReadonlySet<number>): void {
        const g = this.overlay;
        const gr = this.ground;
        g.clear();
        gr.clear();
        const cam = this.scene.cameras.main.worldView;
        const world = this.world;

        // Nền móng của công trình đang xây.
        for (const b of world.buildings) {
            if (b.built || BUILDINGS[b.type].walkable) continue;
            if (b.owner !== HUMAN && !world.fog.isExplored(b.tx, b.ty)) continue;
            const r = world.rectOf(b);
            gr.fillStyle(0x7a5230, 0.55).fillRect(r.x0 + 4, r.y0 + 4, r.x1 - r.x0 - 8, r.y1 - r.y0 - 8);
            gr.lineStyle(2, PLAYER_TINT[b.owner], 0.8).strokeRect(r.x0 + 4, r.y0 + 4, r.x1 - r.x0 - 8, r.y1 - r.y0 - 8);
        }

        for (const id of selected) {
            const e = world.get(id);
            if (!e) continue;
            const own = e.owner === HUMAN;
            const col = own ? 0x22ff66 : e.owner < 0 ? 0xffee55 : 0xff4444;
            gr.lineStyle(2, col, 0.9);
            if (e.kind === 'unit') {
                const r = UNITS[e.type].radius + 6;
                gr.strokeEllipse(e.x, e.y + 4, r * 2, r * 1.1);
            } else {
                const r = world.rectOf(e);
                gr.strokeRect(r.x0 + 2, r.y0 + 2, r.x1 - r.x0 - 4, r.y1 - r.y0 - 4);
                if (e.kind === 'building' && own && e.rally) {
                    const c = world.centerOf(e);
                    gr.lineStyle(1, 0xffffff, 0.5).lineBetween(c.x, c.y, e.rally.x, e.rally.y);
                    gr.fillStyle(0xffffff, 1).fillTriangle(e.rally.x, e.rally.y - 26, e.rally.x + 14, e.rally.y - 20, e.rally.x, e.rally.y - 14);
                    gr.lineStyle(2, 0xffffff, 1).lineBetween(e.rally.x, e.rally.y, e.rally.x, e.rally.y - 26);
                }
            }
        }

        for (const u of world.units) {
            if (u.x < cam.x - 64 || u.x > cam.right + 64 || u.y < cam.y - 64 || u.y > cam.bottom + 64) continue;
            if (!selected.has(u.id) && u.hp >= u.maxHp) continue;
            if (u.owner !== HUMAN && !world.fog.isVisible(GameMap.toTile(u.x), GameMap.toTile(u.y))) continue;
            this.bar(g, u.x - 18, u.y - UNIT_SPRITES[u.type].frame * UNIT_SPRITES[u.type].scale * 0.42, 36, u.hp / u.maxHp, u.owner);
        }
        for (const b of world.buildings) {
            const r = world.rectOf(b);
            if (r.x1 < cam.x || r.x0 > cam.right || r.y1 < cam.y || r.y0 > cam.bottom) continue;
            if (b.owner !== HUMAN && !world.fog.isExplored(b.tx, b.ty)) continue;
            const s = BUILDINGS[b.type];
            const w = Math.min(96, (r.x1 - r.x0) * 0.7);
            const cx = (r.x0 + r.x1) / 2;
            const showHp = selected.has(b.id) || b.hp < b.maxHp;
            if (showHp) this.bar(g, cx - w / 2, r.y0 - 20, w, b.hp / b.maxHp, b.owner);
            if (!b.built) this.bar(g, cx - w / 2, r.y1 - 12, w, b.progress / s.buildTime, -2);
            else if (b.queue.length && b.owner === HUMAN) this.bar(g, cx - w / 2, r.y1 - 12, w, b.queueTime / b.queue[0].time, b.queueBlocked ? -3 : -2);
        }

        this.markers = this.markers.filter(m => (m.t += dt) < 0.6);
        for (const m of this.markers) {
            const k = m.t / 0.6;
            gr.lineStyle(3, m.color, 1 - k).strokeEllipse(m.x, m.y, 30 * (1 - k * 0.6), 16 * (1 - k * 0.6));
        }
    }

    /** owner -2 = thanh tiến độ, -3 = tiến độ bị dừng. */
    private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, ratio: number, owner: number): void {
        const col = owner === -2 ? 0xffd34d : owner === -3 ? 0x999999 : owner === HUMAN ? 0x3ddc5a : 0xe84545;
        g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 7);
        g.fillStyle(col, 1).fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), 5);
    }

    // ---------- Xem trước đặt công trình ----------

    showPreview(type: BuildingType | null, tx: number, ty: number, ok: boolean): void {
        const g = this.previewGfx;
        g.clear();
        if (!type) { this.preview.setVisible(false); return; }
        const s = BUILDINGS[type];
        const col = ok ? 0x22ff66 : 0xff3333;
        g.fillStyle(col, 0.3).fillRect(tx * TILE, ty * TILE, s.w * TILE, s.h * TILE);
        g.lineStyle(2, col, 0.9).strokeRect(tx * TILE, ty * TILE, s.w * TILE, s.h * TILE);
        const file = BUILDING_SPRITES[type].file;
        if (file) {
            this.preview.setTexture(buildingKey('blue', type)).setVisible(true).setOrigin(0.5, 1)
                .setPosition((tx + s.w / 2) * TILE, (ty + s.h) * TILE + 8);
            this.preview.setScale(Math.min(1.1, (s.w * TILE + 24) / this.preview.width));
            this.preview.setTint(ok ? 0xffffff : 0xff8888);
        } else this.preview.setVisible(false);
    }
}

/** Chọn frame tileset theo các ô lân cận (bộ 3x3, dải ngang/dọc, ô đơn). `col` = cột bắt đầu. */
function autoTile(is: (x: number, y: number) => boolean, x: number, y: number, col: number): number {
    const up = is(x, y - 1), down = is(x, y + 1), left = is(x - 1, y), right = is(x + 1, y);
    if (!up && !down) {
        if (!left && !right) return 30 + col;
        return 27 + col + (!left ? 0 : !right ? 2 : 1);
    }
    if (!left && !right) return 3 + col + (!up ? 0 : !down ? 18 : 9);
    const r = !up ? 0 : !down ? 2 : 1;
    const c = !left ? 0 : !right ? 2 : 1;
    return r * 9 + c + col;
}

function isCoast(map: GameMap, x: number, y: number): boolean {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (map.inBounds(nx, ny) && !map.isLand(nx, ny)) return true;
    }
    return false;
}
