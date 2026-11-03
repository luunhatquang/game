import { BuildingType, Cost, NodeType, ResourceType, UnitType } from '../config/balance';
import { Difficulty } from '../config/ai';

export const GAIA = -1;
export const HUMAN = 0;
export const AI_PLAYER = 1;

export type UnitState = 'idle' | 'move' | 'gather' | 'return' | 'build' | 'attack' | 'dead';

export type Order =
    | { type: 'move'; x: number; y: number }
    | { type: 'attackMove'; x: number; y: number }
    | { type: 'gather'; target: number }
    | { type: 'build'; target: number }
    | { type: 'attack'; target: number; auto?: boolean };

/** Hình chữ nhật theo px thế giới. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export interface Unit {
    id: number;
    kind: 'unit';
    type: UnitType;
    owner: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    state: UnitState;
    order: Order | null;
    /** Order chờ sau khi xong lệnh hiện tại (attack-move quay lại). */
    resume: Order | null;
    /** Điểm đến cuối của đường đi (px). */
    goalX: number;
    goalY: number;
    goalRect: Rect | null;
    path: number[];
    pathIndex: number;
    pathPending: boolean;
    moving: boolean;
    stuckTime: number;
    repaths: number;
    cooldown: number;
    /** Thời gian còn lại của animation đánh/khai thác (để vẽ). */
    actionTime: number;
    facing: number;
    carryType: ResourceType | null;
    carry: number;
    /** Nguồn khai thác gần nhất để quay lại. */
    lastNodeType: NodeType | 'farm' | null;
    lastNodeX: number;
    lastNodeY: number;
    scanTimer: number;
}

export interface QueueItem {
    kind: 'unit' | 'age';
    unit?: UnitType;
    cost: Cost;
    time: number;
}

export interface Building {
    id: number;
    kind: 'building';
    type: BuildingType;
    owner: number;
    tx: number;
    ty: number;
    w: number;
    h: number;
    hp: number;
    maxHp: number;
    built: boolean;
    /** Giây đã xây. */
    progress: number;
    queue: QueueItem[];
    /** Giây đã sản xuất cho mục đầu hàng đợi. */
    queueTime: number;
    queueBlocked: boolean;
    rally: { x: number; y: number; target: number } | null;
    cooldown: number;
    /** Thức ăn còn lại (nông trại). */
    food: number;
}

export interface ResourceNode {
    id: number;
    kind: 'node';
    type: NodeType;
    owner: number;
    tx: number;
    ty: number;
    amount: number;
    variant: number;
}

export type Entity = Unit | Building | ResourceNode;

export interface Projectile {
    id: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    target: number;
    tx: number;
    ty: number;
    damage: number;
    attacker: UnitType | null;
    owner: number;
}

export interface Player {
    id: number;
    resources: Record<ResourceType, number>;
    age: number;
    pop: number;
    popCap: number;
    isAI: boolean;
    difficulty: Difficulty;
    defeated: boolean;
}

export type GameEvent =
    | { type: 'message'; owner: number; text: string; level?: 'info' | 'warn' }
    | { type: 'attacked'; owner: number; x: number; y: number }
    | { type: 'death'; x: number; y: number; unit: UnitType; owner: number }
    | { type: 'destroyed'; x: number; y: number; building: BuildingType; owner: number }
    | { type: 'built'; owner: number; id: number }
    | { type: 'trained'; owner: number; id: number }
    | { type: 'age'; owner: number; age: number }
    | { type: 'hit'; x: number; y: number }
    | { type: 'shoot'; owner: number }
    | { type: 'gameover'; winner: number };
