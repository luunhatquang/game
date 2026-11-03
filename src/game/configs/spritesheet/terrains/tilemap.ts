import { SCALE } from "../../../constants/game"
import { SpritesheetConfig } from "../../../types/configs"
import { TILEMAP_COLOR, TilemapColor } from "../../../types/terrains"

export const BASE_SPRITESHEET = {
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

function getColoredTilemapSpritesheet(color: TilemapColor): SpritesheetConfig{
    return {
        key: `tilemap-${color}`,
        path: `/public/assets/terrain/Tileset/Tilemap_${color.toLowerCase()}.png`,
        ...BASE_SPRITESHEET
    }
}

function getSpritesheets(): Record<TilemapColor, SpritesheetConfig>{
    const spritesheets: Partial<Record<TilemapColor, SpritesheetConfig>> = {}
    for(const color of TILEMAP_COLOR){
        spritesheets[color] = getColoredTilemapSpritesheet(color)
    }
    return spritesheets as Record<TilemapColor, SpritesheetConfig>
}

export const TILEMAP_SPRITESHEETS = getSpritesheets()

export const TILEMAP_FRAMES = {
    MULTIPLE: {
        WATER: [
            [0, 1, 2],
            [9, 10, 11],
            [18, 19, 20]
        ],
        GROUND: [
            [5, 6, 7],
            [14, 15, 16],
            [23, 24, 25]
        ],
    },
    VERTICAL_LINE: {
        WATER: [3, 12, 21],
        GROUND: [8, 17, 26]
    },    
    HORIZONTAL_LINE:{
        WATER: [27, 28, 29],
        GROUND: [32, 33, 34]
    },
    SINGLE: {
        WATER: 30,
        GROUND: 35
    },
    STAIR: {
        LEFT: [36, 45],
        RIGHT: [39, 48]
    },

    ELEVATION: {
        LINE: {
            GROUND: [41, 42, 43],
            WATER: [50, 51, 52]
        },
        SINGLE: {
            GROUND: 44,
            WATER: 53
        }
    }

}