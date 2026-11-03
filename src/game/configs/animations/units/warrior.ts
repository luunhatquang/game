import { AnimationConfig } from "../../../types/configs";
import { PawnColor, WARRIOR_ACTION, WARRIOR_COLOR, WarriorAction, WarriorColor } from "../../../types/units";
import { WARRIOR_SPRITESHEETS } from "../../spritesheet/units/warrior";


const BASE_ANIMATION_CONFIG = {
    repeat: -1,
    frameRate: 10
}

function getAnimation(
    color: WarriorColor,
    action: WarriorAction
){
    const spritesheet = WARRIOR_SPRITESHEETS[color][action]
    const animation: AnimationConfig = {
        key: `${color.toLowerCase()}-warrior-${action.toLowerCase()}`,
        spritesheetKey: spritesheet.key,
        ...BASE_ANIMATION_CONFIG
    }
    if(action == "ATTACK1")
        animation.repeat = 0
    return animation
}

function getColoredAnimation(
    color: WarriorColor
){
    return Object.fromEntries(
        WARRIOR_ACTION.map(action => [
            action,
            getAnimation(color, action)
        ])
    ) as Record<WarriorAction, AnimationConfig>;
}

export const WARRIOR_ANIMATION = Object.fromEntries(
    WARRIOR_COLOR.map(color => [
        color,
        getColoredAnimation(color)
    ])
) as Record<PawnColor, Record<WarriorAction, AnimationConfig>>;