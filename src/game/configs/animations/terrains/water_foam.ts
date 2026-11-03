import { AnimationConfig } from "../../../types/configs"
import { WATER_FOAM_ANIMATION_EDGE, WaterFoamAnimationEdge } from "../../../types/terrains"
import { WATER_FOAM_SPRITESHEET } from "../../spritesheet/terrains/water_foam"

export const BASE_CONFIG = {
    frameRate: 10,
    repeat: -1,
    spritesheetKey: WATER_FOAM_SPRITESHEET.key
}

const FRAMES = {
    TOP : [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46],
    BOTTOM : [97, 100, 103, 106, 109, 112, 115, 118, 121, 124, 127, 130, 133, 136, 139, 142],
    LEFT: [48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93],
    RIGHT: [50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80, 83, 86, 89, 92, 95],
    MIDDLE: [49, 52, 55, 58, 61, 64, 67, 70, 73, 76, 79, 82, 85, 88, 91, 94]
}

function getAnimtations(){
    const animtaions: Partial<Record<WaterFoamAnimationEdge, AnimationConfig>> = {}
    for(const edge of WATER_FOAM_ANIMATION_EDGE){
        animtaions[edge] = {
            ...BASE_CONFIG,
            key: `${edge.toLowerCase()}-water-foam`,
            framesConfigArray: FRAMES[edge] 
        }
    }
    return animtaions as Record<WaterFoamAnimationEdge, AnimationConfig>
}

export const WATER_FOAM_ANIMATIONS = getAnimtations()