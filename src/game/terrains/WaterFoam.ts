import { Scene } from "phaser";
import { CreateWaterFoamConfig } from "../types/terrains";
import { WATER_FOAM_SPRITESHEET } from "../configs/spritesheet/terrains/water_foam";
import { WATER_FOAM_ANIMATIONS } from "../configs/animations/terrains/water_foam";

export class WaterFoam {
    static getSize(){
        const size = WATER_FOAM_SPRITESHEET.size.width * WATER_FOAM_SPRITESHEET.scale
        return size
    }

    static create(
        scene: Scene,
        config: CreateWaterFoamConfig
    ) {
        if(config.hasMiddle){

        }else{
            this.createNotHasMiddle(scene, config)
        }
        
    }

    static createNotHasMiddle(
        scene: Scene,
        config: CreateWaterFoamConfig
    ) {
        let {width, height, x, y} = config
        const size = this.getSize()
        for(let i = 0; i < width; i++){
            scene.add.sprite(x + i*size, y, WATER_FOAM_SPRITESHEET.key).play(WATER_FOAM_ANIMATIONS.TOP)
            scene.add.sprite(x + i*size, y + (height-1)*size, WATER_FOAM_SPRITESHEET.key).play(WATER_FOAM_ANIMATIONS.BOTTOM)
        }

        for(let i = 0; i < height; i++){
            scene.add.sprite(x, y + i*size, WATER_FOAM_SPRITESHEET.key).play(WATER_FOAM_ANIMATIONS.LEFT)
            scene.add.sprite(x + (width-1)*size, y + i*size, WATER_FOAM_SPRITESHEET.key).play(WATER_FOAM_ANIMATIONS.RIGHT)
        }
    }
}