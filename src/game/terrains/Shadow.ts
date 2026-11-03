import { Scene } from "phaser";;
import { SHADOW_FRAMES, SHADOW_SPRITESHEET } from "../configs/spritesheet/terrains/shadow";
import { CreateTerrainShadowConfig } from "../types/terrains";

export class Shadow {
    static getSize(){
        return SHADOW_SPRITESHEET.size.width * SHADOW_SPRITESHEET.scale
    }

    static create(
        scene: Scene,
        config: CreateTerrainShadowConfig
    ) {
        const size = this.getSize();
        const scale = SHADOW_SPRITESHEET.scale
        const {width, height, x, y} = config
        for(let i = 0; i < height; i++){
            for(let j = 0; j < width; j++){
                let row = i == 0 ? 0 : (i == height - 1 ? 2 : 1)
                let column = j == 0 ? 0 : (j == width - 1 ? 2 : 1)
                scene.add.image(
                    x + j * size,
                    y + i * size,
                    SHADOW_SPRITESHEET.key,
                    SHADOW_FRAMES[row][column]
                ).setOrigin(0, 0).setScale(scale).setDepth(0)
            }
        }
    }
}