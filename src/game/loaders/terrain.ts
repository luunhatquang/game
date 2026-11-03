import Phaser from "phaser";
import { TERRAIN_SPRITESHEETS } from "../configs/spritesheet/terrains/terrains";
import { WATER_FOAM_ANIMATIONS } from "../configs/animations/terrains/water_foam";
import { WATER_FOAM_SPRITESHEET } from "../configs/spritesheet/terrains/water_foam";

export class TerrainLoader {
    static loadTilemapSpritesheets(
        scene: Phaser.Scene
    ){
        for(const [_color, spritesheet] of Object.entries(TERRAIN_SPRITESHEETS.TILEMAP_SPRITESHEETS)){
            scene.load.spritesheet(
                spritesheet.key,
                spritesheet.path,
                spritesheet.spriteSize
            )
        }
    }

    static loadWaterFoamSpritesheets(
        scene: Phaser.Scene
    ){
        scene.load.spritesheet(
            WATER_FOAM_SPRITESHEET.key,
            WATER_FOAM_SPRITESHEET.path,
            WATER_FOAM_SPRITESHEET.spriteSize
        )
    }

    static loadSpritesheets(scene: Phaser.Scene){
        this.loadTilemapSpritesheets(scene)
        this.loadWaterFoamSpritesheets(scene)
    }

    static loadAnimation(scene: Phaser.Scene){
        for(const [edge, animation] of Object.entries(WATER_FOAM_ANIMATIONS)){
            scene.anims.create({
                frames: scene.anims.generateFrameNumbers(
                    animation.spritesheetKey,
                    {frames: animation.framesConfigArray}
                ),
                ...animation
            })
        }
    }
}