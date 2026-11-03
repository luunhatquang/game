import { Scene } from "phaser";
import { CreateTilemapConfig, TilemapColor } from "../types/terrains";
import { TILEMAP_FRAMES, TILEMAP_SPRITESHEETS } from "../configs/spritesheet/terrains/tilemap";

export class Tilemap {
    static create(
        scene: Scene,
        config: CreateTilemapConfig
    ) {
        const {width, height} = config
        if(width == 1 && height == 1)
            this.createSingle(scene, config)
        else{
            if(width == 1)
                this.createVerticalLine(scene, config)
            else if(height == 1)
                this.createHorizontalLine(scene, config)
            else
                this.createMultiple(scene, config)
        }
    }

    private static getSize(color: TilemapColor): number {
        return (
            TILEMAP_SPRITESHEETS[color].size.width *
            TILEMAP_SPRITESHEETS[color].scale
        );
    }

    static createMultiple(
        scene: Scene,
        config: CreateTilemapConfig
    ) {
        const {x, y, width, height, isOnGround, color} = config
        const size = this.getSize(color);
        const scale = TILEMAP_SPRITESHEETS[color].scale
        const on = isOnGround ? "GROUND" : "WATER"
        for(let i = 0; i < height; i++){
            for(let j = 0; j < width; j++){
                let row = i == 0 ? 0 : (i == height - 1 ? 2 : 1)
                let column = j == 0 ? 0 : (j == width - 1 ? 2 : 1)
                scene.add.image(
                    x + j * size,
                    y + i * size,
                    TILEMAP_SPRITESHEETS[color].key,
                    TILEMAP_FRAMES["MULTIPLE"][on][row][column]
                ).setOrigin(0, 0).setScale(scale)
            }
        }
        if(isOnGround){
            for(let i = 0; i < width; i++){
                scene.add.image(
                    x + i * size + width * size,
                    y + height * size,
                    TILEMAP_SPRITESHEETS[color].key,
                    TILEMAP_FRAMES["ELEVATION"]["LINE"]["GROUND"][i]
                ).setOrigin(0, 0).setScale(scale)
            }
        }
    }

    static createVerticalLine(
        scene: Scene,
        config: CreateTilemapConfig
    ) {

    }

    static createHorizontalLine(
        scene: Scene,
        config: CreateTilemapConfig
    ) {

    }

    static createSingle(
        scene: Scene,
        config: CreateTilemapConfig
    ) {
    }

    static createLittle(
        scene: Scene,
        config: CreateTilemapConfig
    ) {
    }
}