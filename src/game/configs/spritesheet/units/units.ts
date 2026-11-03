import { SpritesheetConfig } from "../../../types/configs";
import { UnitType } from "../../../types/units";
import { PAWN_SPRITESHEETS as PAWN } from "./pawn";
import { WARRIOR_SPRITESHEETS as WARRIOR } from "./warrior";

export const UNITS_SPRITESHEETS = {
    PAWN,
    WARRIOR
} as Record<UnitType, Record<string, Record<string, SpritesheetConfig>>>;