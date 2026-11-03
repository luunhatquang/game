// Mọi số liệu cân bằng game nằm ở đây. Logic không hard-code các giá trị này.

export type ResourceType = 'wood' | 'food' | 'gold' | 'stone';
export const RESOURCE_TYPES: ResourceType[] = ['wood', 'food', 'gold', 'stone'];
export type Cost = Partial<Record<ResourceType, number>>;

export type UnitType = 'pawn' | 'infantry' | 'archer' | 'cavalry';
export type BuildingType =
    | 'castle' | 'house' | 'lumberCamp' | 'miningCamp' | 'mill' | 'farm'
    | 'barracks' | 'archery' | 'stable' | 'tower';
export type NodeType = 'tree' | 'gold' | 'stone' | 'berry' | 'sheep';

/** Kích thước 1 ô lưới (px thế giới). */
export const TILE = 64;

export interface UnitStats {
    name: string;
    cost: Cost;
    hp: number;
    damage: number;
    /** Tầm đánh tính bằng ô (khoảng cách từ mép mục tiêu). */
    range: number;
    /** Thời gian giữa 2 đòn (giây). */
    cooldown: number;
    /** px/giây */
    speed: number;
    /** Tầm nhìn (ô). */
    sight: number;
    trainTime: number;
    pop: number;
    /** true = bắn tên có bay. */
    ranged?: boolean;
    radius: number;
}

export const UNITS: Record<UnitType, UnitStats> = {
    pawn:     { name: 'Pawn',     cost: { food: 50 },              hp: 40,  damage: 3, range: 0.5, cooldown: 1.2, speed: 110, sight: 5, trainTime: 12, pop: 1, radius: 14 },
    infantry: { name: 'Bộ binh',  cost: { food: 60, gold: 20 },    hp: 60,  damage: 7, range: 0.5, cooldown: 1.2, speed: 105, sight: 5, trainTime: 15, pop: 1, radius: 15 },
    archer:   { name: 'Cung thủ', cost: { wood: 30, gold: 45 },    hp: 35,  damage: 5, range: 5,   cooldown: 1.6, speed: 105, sight: 7, trainTime: 16, pop: 1, radius: 14, ranged: true },
    cavalry:  { name: 'Kỵ binh',  cost: { food: 80, gold: 60 },    hp: 120, damage: 9, range: 0.6, cooldown: 1.5, speed: 165, sight: 6, trainTime: 20, pop: 1, radius: 20 },
};

/** Hệ số sát thương: COUNTERS[kẻ đánh][mục tiêu]. Mặc định 1. */
export const COUNTERS: Partial<Record<UnitType, Partial<Record<UnitType, number>>>> = {
    infantry: { cavalry: 1.5 },
    cavalry:  { archer: 1.5 },
    archer:   { infantry: 1.5 },
};

/** Sát thương nhân thêm khi đánh vào công trình. */
export const BUILDING_DAMAGE_MULT: Record<UnitType, number> = {
    pawn: 1, infantry: 1.5, archer: 0.4, cavalry: 1,
};

export interface BuildingStats {
    name: string;
    cost: Cost;
    hp: number;
    buildTime: number;
    /** Kích thước nền (ô). */
    w: number;
    h: number;
    sight: number;
    popBonus?: number;
    accepts?: ResourceType[];
    trains?: UnitType[];
    requires?: BuildingType[];
    age?: number;
    /** Công trình tự bắn tên. */
    attack?: { damage: number; range: number; cooldown: number };
    /** Nông trại: lượng thức ăn, không chặn đường. */
    food?: number;
    walkable?: boolean;
    /** Có thể nghiên cứu lên đời ở đây. */
    canAgeUp?: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingStats> = {
    castle:     { name: 'Nhà chính',   cost: { wood: 300, stone: 200 }, hp: 1800, buildTime: 90, w: 4, h: 3, sight: 8, popBonus: 10, accepts: ['wood', 'food', 'gold', 'stone'], trains: ['pawn'], canAgeUp: true, attack: { damage: 4, range: 6, cooldown: 2 } },
    house:      { name: 'Nhà dân',     cost: { wood: 30 },              hp: 550,  buildTime: 18, w: 2, h: 2, sight: 4, popBonus: 5 },
    lumberCamp: { name: 'Trại gỗ',     cost: { wood: 100 },             hp: 600,  buildTime: 25, w: 2, h: 2, sight: 5, accepts: ['wood'] },
    miningCamp: { name: 'Trại mỏ',     cost: { wood: 100 },             hp: 600,  buildTime: 25, w: 2, h: 2, sight: 5, accepts: ['gold', 'stone'] },
    mill:       { name: 'Cối xay',     cost: { wood: 100 },             hp: 600,  buildTime: 25, w: 2, h: 2, sight: 5, accepts: ['food'] },
    farm:       { name: 'Nông trại',   cost: { wood: 60 },              hp: 300,  buildTime: 15, w: 2, h: 2, sight: 2, requires: ['mill'], food: 250, walkable: true },
    barracks:   { name: 'Nhà lính',    cost: { wood: 150 },             hp: 1200, buildTime: 40, w: 3, h: 3, sight: 5, trains: ['infantry'] },
    archery:    { name: 'Trường bắn',  cost: { wood: 150, gold: 50 },   hp: 1200, buildTime: 40, w: 3, h: 3, sight: 5, trains: ['archer'], requires: ['barracks'], age: 2 },
    stable:     { name: 'Chuồng ngựa', cost: { wood: 150, gold: 50 },   hp: 1200, buildTime: 40, w: 3, h: 3, sight: 5, trains: ['cavalry'], requires: ['barracks'], age: 2 },
    tower:      { name: 'Tháp canh',   cost: { wood: 100, stone: 100 }, hp: 900,  buildTime: 35, w: 2, h: 2, sight: 9, age: 2, attack: { damage: 6, range: 7, cooldown: 1.5 } },
};

/** Thứ tự nút trong bảng xây của pawn. */
export const BUILD_MENU: BuildingType[] = [
    'house', 'lumberCamp', 'miningCamp', 'mill', 'farm',
    'barracks', 'archery', 'stable', 'tower', 'castle',
];

export interface NodeStats {
    name: string;
    resource: ResourceType;
    amount: number;
    /** đơn vị/giây cho 1 pawn */
    gatherRate: number;
}

export const NODES: Record<NodeType, NodeStats> = {
    tree:  { name: 'Cây',      resource: 'wood',  amount: 100, gatherRate: 0.7 },
    gold:  { name: 'Mỏ vàng',  resource: 'gold',  amount: 250, gatherRate: 0.6 },
    stone: { name: 'Mỏ đá',    resource: 'stone', amount: 250, gatherRate: 0.6 },
    berry: { name: 'Bụi quả',  resource: 'food',  amount: 120, gatherRate: 0.7 },
    sheep: { name: 'Cừu',      resource: 'food',  amount: 100, gatherRate: 1.0 },
};
export const FARM_GATHER_RATE = 0.6;

export const ECONOMY = {
    carryCapacity: 10,
    /** Bán kính (ô) tìm nguồn cùng loại khi nguồn cạn. */
    searchRadius: 14,
    /** Tỉ lệ máu lúc bắt đầu xây. */
    foundationHpRatio: 0.1,
    /** Bán kính (ô) pawn tự xây tiếp công trình dở dang gần đó. */
    autoBuildRadius: 8,
};

export const AGE_UP = {
    cost: { food: 500, gold: 200 } as Cost,
    time: 60,
    name: 'Lên Thời đại 2',
};

export const POPULATION = { max: 200 };
export const PRODUCTION = { maxQueue: 5 };

export const START = {
    resources: { wood: 200, food: 200, gold: 100, stone: 50 } as Record<ResourceType, number>,
    pawns: 4,
};

export const PROJECTILE = { speed: 520 };

export const MAP = {
    width: 80,
    height: 60,
    trees: 0.11,          // mật độ rừng
    rockClusters: 10,
    lakes: 3,
    /** Số cụm mỏ quanh mỗi căn cứ, số ô (node) mỗi cụm. */
    goldPerBase: 2,
    stonePerBase: 1,
    mineClusterSize: 4,
    berriesPerBase: 6,
    sheepPerBase: 6,
    /** Cụm mỏ thêm ở giữa bản đồ (mỗi bên). */
    extraGold: 2,
    extraStone: 2,
};
