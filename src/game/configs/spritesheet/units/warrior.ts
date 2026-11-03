import { SCALE } from "../../../constants/game"
import { SpritesheetConfig } from "../../../types/configs"
import { WarriorColor, WarriorAction } from "../../../types/units"

const BASE_SPRITESHEET = {
    spriteSize: {
        frameHeight: 192,
        frameWidth: 192
    },
    size: {
        height: 86,
        width: 86
    },
    scale: 1*SCALE
}

function getSpritesheet(
    color: WarriorColor,
    action: WarriorAction
){
    const spritesheet: SpritesheetConfig = {
        key: `${color.toLowerCase()}-warrior-${action.toLowerCase()}`,
        path: `/assets/units/${color.toLowerCase()} units/warrior/warrior_${action.toLowerCase()}.png`,
        ...BASE_SPRITESHEET
    }
    return spritesheet
}

function getColoredSpritesheet(color: WarriorColor){
    return {
        IDLE : getSpritesheet(color, "IDLE"),
        RUN : getSpritesheet(color, "RUN"),
        ATTACK1 : getSpritesheet(color, "ATTACK1")
    }
}

export const WARRIOR_SPRITESHEETS = {
    BLUE : getColoredSpritesheet("BLUE"),
    RED : getColoredSpritesheet("RED"),
    BLACK : getColoredSpritesheet("BLACK"),
    YELLOW : getColoredSpritesheet("YELLOW"),
    PURPLE : getColoredSpritesheet("PURPLE")
}