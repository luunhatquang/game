export const WARRIOR_COLOR = ["BLUE", "BLACK", "PURPLE", "YELLOW", "RED"] as const
export const WARRIOR_ACTION = ["IDLE", "RUN", "ATTACK1"] as const
export type WarriorColor = typeof WARRIOR_COLOR[number]
export type WarriorAction = typeof WARRIOR_ACTION[number]

export const PAWN_COLOR = ["BLUE", "BLACK", "PURPLE", "YELLOW", "RED"] as const
export const PAWN_ACTION = ["IDLE", "RUN", "INTERACT_KNIFE"] as const
export type PawnColor = typeof PAWN_COLOR[number]
export type PawnAction = typeof PAWN_ACTION[number];

export const UNIT_TYPE = ["PAWN", "WARRIOR"] as const
export type UnitType = typeof UNIT_TYPE[number]