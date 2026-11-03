import { SCALE } from "../../../constants/game"
import { SpritesheetConfig } from "../../../types/configs"
import { PawnColor, PawnAction, PAWN_ACTION, PAWN_COLOR } from "../../../types/units"

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
    color: PawnColor,
    action: PawnAction
){
    const spritesheet: SpritesheetConfig = {
        key: `${color.toLowerCase()}-pawn-${action.toLowerCase()}`,
        path: `/assets/units/${color.toLowerCase()} units/pawn/pawn_${action.toLowerCase()}.png`,
        ...BASE_SPRITESHEET
    }
    return spritesheet
}

function getColoredSpritesheet(color: PawnColor){
    return Object.fromEntries(
        PAWN_ACTION.map(action => [
            action,
            getSpritesheet(color, action)
        ])
    ) as Record<PawnAction, SpritesheetConfig>;
}

export const PAWN_SPRITESHEETS = Object.fromEntries(
    PAWN_COLOR.map(color => [
        color,
        getColoredSpritesheet(color)
    ])
) as Record<PawnColor, Record<PawnAction, SpritesheetConfig>>;

