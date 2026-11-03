import Phaser from "phaser";
import { UNITS_SPRITESHEETS } from "../configs/spritesheet/units/units";
import { UnitType, UNIT_TYPE } from "../types/units";
import { UNITS_ANIMATIONS } from "../configs/animations/units/unit";

export class UnitLoader {
    static loadSpritesheets(
        scene: Phaser.Scene,
        units: UnitType[] = UNIT_TYPE.slice(0)
    ): void {
        for(const unit of units){
            for (const [_color, actions] of Object.entries(UNITS_SPRITESHEETS[unit])) {
                for (const [_action, spritesheet] of Object.entries(actions)) {
                    scene.load.spritesheet(
                        spritesheet.key,
                        spritesheet.path,
                        {
                            frameWidth: spritesheet.spriteSize.frameWidth,
                            frameHeight: spritesheet.spriteSize.frameHeight
                        }
                    );
                }
            }
        }
    }

    static createAnimations(
        scene: Phaser.Scene,
        units: UnitType[] = UNIT_TYPE.slice(0)
    ): void {
        for(const unit of units){
            for (const [_color, actions] of Object.entries(UNITS_ANIMATIONS[unit])) {
                for (const [_action, animation] of Object.entries(actions)) {
                    scene.anims.create({
                        key: animation.key,
                        frameRate: animation.frameRate,
                        repeat: animation.repeat,
                        frames: scene.anims.generateFrameNumbers(animation.spritesheetKey, animation.framesConfigInterval),    
                    })
                }
            }
        }
    }
}