import { AnimationConfig } from "../../../types/configs";
import { UnitType } from "../../../types/units";
import { PAWN_ANIMATION as PAWN } from "./pawn";
import { WARRIOR_ANIMATION as WARRIOR } from "./warrior";

export const UNITS_ANIMATIONS = {
    PAWN,
    WARRIOR
} as Record<UnitType, Record<string, Record<string, AnimationConfig>>>