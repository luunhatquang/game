import { AnimationConfig } from "../../../types/configs";
import { PawnAction, PawnColor, PAWN_ACTION, PAWN_COLOR } from "../../../types/units";
import { PAWN_SPRITESHEETS } from "../../spritesheet/units/pawn";

const BASE_ANIMATION_CONFIG = {
    repeat: -1,
    frameRate: 10
}

function getAnimation(
    color: PawnColor,
    action: PawnAction
){
    const spritesheet = PAWN_SPRITESHEETS[color][action]
    const animation: AnimationConfig = {
        key: `${color.toLowerCase()}-pawn-${action.toLowerCase()}`,
        spritesheetKey: spritesheet.key,
        ...BASE_ANIMATION_CONFIG
    }
    if(action == "INTERACT_KNIFE")
        animation.repeat = 0
    return animation
}

function getColoredAnimation(
    color: PawnColor
){
    return Object.fromEntries(
        PAWN_ACTION.map(action => [
            action,
            getAnimation(color, action)
        ])
    ) as Record<PawnAction, AnimationConfig>;
}

export const PAWN_ANIMATION = Object.fromEntries(
    PAWN_COLOR.map(color => [
        color,
        getColoredAnimation(color)
    ])
) as Record<PawnColor, Record<PawnAction, AnimationConfig>>;