export const TILEMAP_ELEVATION_TYPE = ["MULTIPLE", "HORIZONTAL_LINE", "VERTICAL_LINE", "SINGLE"] as const
export type TilemapElevationType = typeof TILEMAP_ELEVATION_TYPE[number]
export interface CreateTilemapElevationConfig{
    x: number,
    y: number,
    width: number,
    height: number,
    elevation: number,
    onGrassColor?: TilemapFlatColor,
    grassColor?: TilemapFlatColor
}

export const TILEMAP_FLAT_COLOR = ["GREEN", "YELLOW"] as const
export const TILEMAP_FLAT_TYPE = ["MULTIPLE", "HORIZONTAL_LINE", "VERTICAL_LINE", "SINGLE", "LITTLE"] as const
export type TilemapFlatColor = typeof TILEMAP_FLAT_COLOR[number]
export type TilemapFlatType = typeof TILEMAP_FLAT_TYPE[number]

export const TILEMAP_COLOR = ["COLOR1", "COLOR2", "COLOR3", "COLOR4", "COLOR5"] as const
export type TilemapColor = typeof TILEMAP_COLOR[number]
export interface CreateTilemapConfig{
    x: number,
    y: number,
    width: number,
    height: number,
    color: TilemapColor,
    isOnGround?: boolean
}

export const WATER_FOAM_ANIMATION_EDGE = ["TOP", "BOTTOM", "LEFT", "RIGHT", "MIDDLE"] as const
export type WaterFoamAnimationEdge = typeof WATER_FOAM_ANIMATION_EDGE[number]
export interface CreateWaterFoamConfig{
    x: number,
    y: number,
    width: number,
    height: number,
    hasMiddle?: boolean,
}

export interface CreateTerrainShadowConfig{
    x: number,
    y: number,
    width: number,
    height: number,
}