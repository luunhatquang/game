import { SCALE } from "../../../constants/game";
import { SpritesheetConfig } from "../../../types/configs";

export const WATER_FOAM_SPRITESHEET: SpritesheetConfig = {
    key: "water-foam",
    path: "/assets/terrain/tileset/water_foam.png",
    scale: 1*SCALE,
    size: {
        height: 64,
        width: 64
    },
    spriteSize: {
        frameHeight: 64,
        frameWidth: 64
    }
}