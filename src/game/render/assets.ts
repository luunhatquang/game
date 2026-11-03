import { Scene } from 'phaser';
import { BuildingType, NodeType, UnitType } from '../config/balance';

/** Màu quân theo người chơi (đúng tên thư mục asset). */
export const PLAYER_COLORS = ['blue', 'red'] as const;
export type PlayerColor = typeof PLAYER_COLORS[number];
export const PLAYER_TINT = [0x3b82f6, 0xef4444];

interface AnimFile { file: string; frames: number; rate: number; repeat: number }
interface UnitSprite { folder: string; frame: number; scale: number; originY: number; anims: Record<string, AnimFile> }

const loop = (file: string, frames: number, rate = 10): AnimFile => ({ file, frames, rate, repeat: -1 });

export const UNIT_SPRITES: Record<UnitType, UnitSprite> = {
    pawn: {
        folder: 'pawn', frame: 192, scale: 0.62, originY: 0.6,
        anims: {
            idle: loop('pawn_idle', 8, 8), run: loop('pawn_run', 6),
            idle_wood: loop('pawn_idle_wood', 8, 8), run_wood: loop('pawn_run_wood', 6),
            idle_gold: loop('pawn_idle_gold', 8, 8), run_gold: loop('pawn_run_gold', 6),
            idle_food: loop('pawn_idle_meat', 8, 8), run_food: loop('pawn_run_meat', 6),
            work_wood: loop('pawn_interact_axe', 6), work_gold: loop('pawn_interact_pickaxe', 6),
            work_food: loop('pawn_interact_knife', 4, 8), build: loop('pawn_interact_hammer', 3, 6),
            attack: loop('pawn_interact_knife', 4, 8),
        },
    },
    infantry: {
        folder: 'warrior', frame: 192, scale: 0.66, originY: 0.6,
        anims: { idle: loop('warrior_idle', 8, 8), run: loop('warrior_run', 6), attack: loop('warrior_attack1', 4, 8) },
    },
    archer: {
        folder: 'archer', frame: 192, scale: 0.62, originY: 0.6,
        anims: { idle: loop('archer_idle', 6, 8), run: loop('archer_run', 4, 8), attack: loop('archer_shoot', 8, 12) },
    },
    cavalry: {
        folder: 'lancer', frame: 320, scale: 0.68, originY: 0.56,
        anims: {
            idle: loop('lancer_idle', 12, 10), run: loop('lancer_run', 6, 12),
            attack: loop('lancer_right_attack', 3, 6), attack_up: loop('lancer_up_attack', 3, 6),
            attack_down: loop('lancer_down_attack', 3, 6), attack_upright: loop('lancer_upright_attack', 3, 6),
            attack_downright: loop('lancer_downright_attack', 3, 6),
        },
    },
};

export function unitAnimKey(color: PlayerColor, type: UnitType, anim: string): string {
    return `${color}-${type}-${anim}`;
}

/** Sprite công trình. `file` rỗng = vẽ placeholder. `badge` = icon tài nguyên gắn kèm. */
export const BUILDING_SPRITES: Record<BuildingType, { file?: string; badge?: string; label?: boolean }> = {
    castle: { file: 'castle' },
    house: { file: 'house1' },
    lumberCamp: { file: 'house2', badge: 'icon-wood', label: true },
    miningCamp: { file: 'house3', badge: 'icon-gold', label: true },
    mill: { file: 'house2', badge: 'icon-food', label: true },
    farm: {},
    barracks: { file: 'barracks' },
    archery: { file: 'archery' },
    stable: { file: 'monastery', label: true },
    tower: { file: 'tower' },
};

export function buildingKey(color: PlayerColor, type: BuildingType): string {
    return `${color}-b-${type}`;
}

export const NODE_SPRITES: Record<NodeType, { keys: string[]; scale: number; originY: number }> = {
    tree: { keys: ['tree1', 'tree2', 'tree3', 'tree4'], scale: 0.5, originY: 0.82 },
    gold: { keys: ['gold4', 'gold5', 'gold6'], scale: 0.7, originY: 0.6 },
    stone: { keys: ['rock1', 'rock2', 'rock3', 'rock4'], scale: 1.4, originY: 0.6 },
    berry: { keys: ['berry1'], scale: 1.0, originY: 0.6 },
    sheep: { keys: ['sheep'], scale: 0.6, originY: 0.62 },
};

export const UI_ICONS = {
    wood: 'assets/ui elements/ui elements/icons/icon_02.png',
    gold: 'assets/ui elements/ui elements/icons/icon_03.png',
    food: 'assets/ui elements/ui elements/icons/icon_04.png',
    stone: 'assets/terrain/decorations/rocks/rock4.png',
    build: 'assets/ui elements/ui elements/icons/icon_01.png',
    attack: 'assets/ui elements/ui elements/icons/icon_05.png',
    cancel: 'assets/ui elements/ui elements/icons/icon_09.png',
    pop: 'assets/ui/icons/regular_02.png',
};

/** Nền CSS hiển thị khung đầu của animation idle, phóng to vào giữa khung để thấy rõ nhân vật. */
export function unitIconStyle(type: UnitType): string {
    const s = UNIT_SPRITES[type];
    const a = s.anims.idle;
    const zoom = type === 'cavalry' ? 2.6 : 2.3;
    const px = ((zoom - 1) / 2) / (a.frames * zoom - 1) * 100;
    return `background-image:url("assets/units/blue units/${s.folder}/${a.file}.png");background-size:auto ${zoom * 100}%;background-position:${px}% 50%`;
}

export function buildingIconUrl(type: BuildingType): string | null {
    const f = BUILDING_SPRITES[type].file;
    return f ? `assets/buildings/blue buildings/${f}.png` : null;
}

export function preloadAssets(scene: Scene): void {
    const L = scene.load;
    L.spritesheet('tiles', 'assets/terrain/tileset/tilemap_color1.png', { frameWidth: 64, frameHeight: 64 });
    L.spritesheet('foam', 'assets/terrain/tileset/water_foam.png', { frameWidth: 192, frameHeight: 192 });

    for (const color of PLAYER_COLORS) {
        for (const [type, s] of Object.entries(UNIT_SPRITES)) {
            const files = new Set(Object.values(s.anims).map(a => a.file));
            for (const f of files) {
                L.spritesheet(`${color}-${f}`, `assets/units/${color} units/${s.folder}/${f}.png`, { frameWidth: s.frame, frameHeight: s.frame });
            }
            void type;
        }
        for (const [type, s] of Object.entries(BUILDING_SPRITES)) {
            if (s.file) L.image(buildingKey(color, type as BuildingType), `assets/buildings/${color} buildings/${s.file}.png`);
        }
    }
    L.image('arrow', 'assets/units/blue units/archer/arrow.png');
    for (let i = 1; i <= 4; i++) {
        L.spritesheet(`tree${i}`, `assets/terrain/resources/wood/trees/tree${i}.png`, { frameWidth: 192, frameHeight: i <= 2 ? 256 : 192 });
        L.image(`rock${i}`, `assets/terrain/decorations/rocks/rock${i}.png`);
    }
    L.image('berry1', 'assets/deco/12.png');
    for (let i = 4; i <= 6; i++) L.image(`gold${i}`, `assets/terrain/resources/gold/gold stones/gold_stone_${i}.png`);
    L.spritesheet('sheep', 'assets/terrain/resources/meat/sheep/sheep_idle.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('dead', 'assets/factions/knights/troops/dead/dead.png', { frameWidth: 128, frameHeight: 128 });
    L.spritesheet('explosion', 'assets/effects/explosion/explosions.png', { frameWidth: 192, frameHeight: 192 });
    L.spritesheet('fire', 'assets/effects/fire/fire.png', { frameWidth: 128, frameHeight: 128 });
    L.image('icon-wood', UI_ICONS.wood);
    L.image('icon-gold', UI_ICONS.gold);
    L.image('icon-food', UI_ICONS.food);
}

export function createAnimations(scene: Scene): void {
    const A = scene.anims;
    for (const color of PLAYER_COLORS) {
        for (const [type, s] of Object.entries(UNIT_SPRITES)) {
            for (const [name, a] of Object.entries(s.anims)) {
                A.create({
                    key: unitAnimKey(color, type as UnitType, name),
                    frames: A.generateFrameNumbers(`${color}-${a.file}`, { start: 0, end: a.frames - 1 }),
                    frameRate: a.rate, repeat: a.repeat,
                });
            }
        }
    }
    A.create({ key: 'foam', frames: A.generateFrameNumbers('foam', { start: 0, end: 15 }), frameRate: 10, repeat: -1 });
    A.create({ key: 'sheep', frames: A.generateFrameNumbers('sheep', { start: 0, end: 5 }), frameRate: 6, repeat: -1 });
    A.create({ key: 'dead', frames: A.generateFrameNumbers('dead', { start: 0, end: 13 }), frameRate: 14, repeat: 0 });
    A.create({ key: 'explosion', frames: A.generateFrameNumbers('explosion', { start: 0, end: 8 }), frameRate: 14, repeat: 0 });
    A.create({ key: 'fire', frames: A.generateFrameNumbers('fire', { start: 0, end: 6 }), frameRate: 10, repeat: -1 });
}
