import { SCALE } from "../../../constants/game"
import { SpritesheetConfig } from "../../../types/configs"

export const SHADOW_SPRITESHEET: SpritesheetConfig = {
    key: "terrain-shadow",
    path: "/assets/terrain/ground/shadows.png",
    spriteSize: {
        frameHeight: 64,
        frameWidth: 64
    },
    size: {
        height: 64,
        width: 64
    },
    scale: 1*SCALE
}

export const SHADOW_FRAMES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8]
]