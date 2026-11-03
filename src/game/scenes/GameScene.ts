import { Scene } from 'phaser';
import { GameController } from '../GameController';
import { createAnimations, preloadAssets } from '../render/assets';

export class GameScene extends Scene {
    private controller!: GameController;

    constructor() {
        super('GameScene');
    }

    preload() {
        this.load.on('loaderror', (file: Phaser.Loader.File) => {
            console.error('Failed to load:', file.key, file.src);
        });
        preloadAssets(this);
    }

    create() {
        createAnimations(this);
        this.controller = new GameController(this);
    }

    private lastTime = 0;

    update() {
        // Tự đo delta thực: delta của Phaser bị làm mượt/chặn nên game chậm lại khi FPS thấp.
        const now = performance.now();
        const delta = this.lastTime ? now - this.lastTime : 16.7;
        this.lastTime = now;
        this.controller.update(delta);
    }
}
