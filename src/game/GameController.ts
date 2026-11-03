import * as Phaser from 'phaser';
import { Difficulty } from './config/ai';
import { RtsInput, InputHost } from './input/RtsInput';
import { WorldRenderer } from './render/WorldRenderer';
import { createWorld } from './sim/mapgen';
import { hasSave, loadFromStorage, saveToStorage } from './sim/save';
import { HUMAN } from './sim/types';
import { World } from './sim/World';
import { Hud, HudHost } from './ui/Hud';
import { Sound } from './ui/Sound';

/** Bước mô phỏng tối đa; khung hình dài hơn được chia nhỏ. */
const MAX_STEP = 0.05;

/** Điều phối vòng lặp game: mô phỏng → sự kiện → vẽ → giao diện. */
export class GameController implements InputHost, HudHost {
    world!: World;
    renderer!: WorldRenderer;
    rts: RtsInput;
    hud: Hud;
    sound = new Sound();
    paused = true;
    private started = false;
    private minimapTimer = 0;

    constructor(private scene: Phaser.Scene) {
        this.rts = new RtsInput(scene, this);
        this.hud = new Hud(this);
        this.hud.showStart();
        window.addEventListener('keydown', this.onKey);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener('keydown', this.onKey);
            this.hud.root.remove();
        });
        // Cho phép kiểm thử tự động truy cập trạng thái game.
        (window as unknown as { rts: GameController }).rts = this;
    }

    private onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' && this.started) { e.preventDefault(); this.hud.jumpToAlert(); }
    };

    // ---------- Vòng lặp ----------

    update(deltaMs: number): void {
        const dt = Math.min(deltaMs / 1000, 0.25);
        this.rts.update(dt);
        if (!this.started) return;
        const w = this.world;
        if (!this.paused && w.winner === null) {
            let left = dt;
            while (left > 1e-6) {
                const step = Math.min(MAX_STEP, left);
                w.tick(step);
                left -= step;
            }
        }
        const events = w.drainEvents();
        this.renderer.handleEvents(events);
        this.hud.handleEvents(events);
        this.renderer.sync(this.paused ? 0 : dt, this.rts.selection);
        this.hud.update(dt);
        this.minimapTimer -= dt;
        if (this.minimapTimer <= 0) {
            this.minimapTimer = 0.2;
            this.hud.drawMinimap(this.scene.cameras.main.worldView);
        }
    }

    // ---------- Bắt đầu / lưu / tải ----------

    startGame(d: Difficulty): void {
        this.setWorld(createWorld(d));
        this.hud.toast(`Bắt đầu trận (${d === 'easy' ? 'Dễ' : d === 'normal' ? 'Thường' : 'Khó'}). Hãy cho pawn đi khai thác tài nguyên!`);
    }

    private setWorld(world: World): void {
        this.world = world;
        if (this.renderer) this.renderer.setWorld(world);
        else this.renderer = new WorldRenderer(this.scene, world);
        this.rts.cancelPlacement();
        this.rts.setSelection([]);
        this.hud.minimap.setWorld(world);
        this.hud.resetPanels();
        const castle = world.buildings.find(b => b.owner === HUMAN && b.type === 'castle');
        const cam = this.scene.cameras.main;
        cam.setZoom(0.8);
        if (castle) { const c = world.centerOf(castle); cam.centerOn(c.x, c.y - 80); }
        this.started = true;
        this.paused = false;
    }

    saveGame(): boolean {
        return this.started && saveToStorage(this.world);
    }

    loadGame(): boolean {
        const w = loadFromStorage();
        if (!w) return false;
        this.setWorld(w);
        this.hud.toast('Đã tải trận.');
        return true;
    }

    hasSave(): boolean {
        return hasSave();
    }

    quitToMenu(): void {
        this.paused = true;
        this.hud.showStart();
    }

    // ---------- Host cho input / HUD ----------

    setPaused(p: boolean): void {
        this.paused = p;
    }

    togglePause(): void {
        if (!this.started) return;
        if (this.hud.screenOpen) this.hud.hidePause();
        else this.hud.showPause();
    }

    toggleMute(): boolean {
        this.sound.muted = !this.sound.muted;
        return this.sound.muted;
    }

    jumpTo(x: number, y: number): void {
        this.scene.cameras.main.centerOn(x, y);
    }

    onSelectionChanged(): void {
        this.hud.refreshPanels();
    }

    playSound(name: string): void {
        this.sound.play(name);
    }
}
