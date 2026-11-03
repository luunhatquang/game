import { Scene, Types } from 'phaser';
import { UnitLoader } from '../loaders/unit';
import { InputController } from '../controllers/InpuController';
import { Warrior } from '../entities/units/Warrior';
import { TerrainLoader } from '../loaders/terrain';
import { Tilemap } from '../terrains/Tilemap';
import { WaterFoam } from '../terrains/WaterFoam';

export class GameScene extends Scene {
    private warrior!: Warrior
    private cursors!: Types.Input.Keyboard.CursorKeys;
    private inputController!: InputController

    constructor() {
        super('GameScene');
    }

    preload() {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
        console.error(
            'Failed to load:',
            file.key,
            file.src
        );
    });

        UnitLoader.loadSpritesheets(this)
        TerrainLoader.loadSpritesheets(this)
        TerrainLoader.loadAnimation(this)
    }

    create() {
        this.inputController = new InputController(this)
        this.warrior = new Warrior(this, 400, 400, "BLUE")
        UnitLoader.createAnimations(this)
        this.cursors = this.input.keyboard!.createCursorKeys()
        // Tilemap.create(this, {
        //     x: 100,
        //     y: 100,
        //     width: 10,
        //     height: 10,
        //     color: "COLOR1"
        // })
        WaterFoam.create(this, {
            x: 100,
            y: 100,
            width: 10,
            height: 10
        })
    }

    update(time: number, delta: number) {
        this.inputController.update(this.warrior)
    }
}
