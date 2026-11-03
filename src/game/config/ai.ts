import { ResourceType } from './balance';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AiConfig {
    label: string;
    /** Chu kỳ ra quyết định (giây). */
    thinkInterval: number;
    /** Hệ số tốc độ khai thác của AI. */
    gatherMult: number;
    maxPawns: number;
    /** Thời điểm đợt tấn công đầu (giây). */
    firstAttackAt: number;
    /** Khoảng cách giữa các đợt (giây). */
    waveInterval: number;
    firstWaveSize: number;
    waveGrowth: number;
    maxWaveSize: number;
    /** Số pawn tối thiểu trước khi lên đời. */
    ageUpPawns: number;
    maxTowers: number;
    maxFarms: number;
    startBonus: Partial<Record<ResourceType, number>>;
    /** Tỉ lệ pawn mong muốn cho từng tài nguyên. */
    gatherWeights: Record<ResourceType, number>;
}

export const AI_CONFIGS: Record<Difficulty, AiConfig> = {
    easy: {
        label: 'Dễ', thinkInterval: 1.5, gatherMult: 0.8, maxPawns: 12,
        firstAttackAt: 540, waveInterval: 240, firstWaveSize: 3, waveGrowth: 1, maxWaveSize: 8,
        ageUpPawns: 12, maxTowers: 0, maxFarms: 4, startBonus: {},
        gatherWeights: { food: 0.45, wood: 0.35, gold: 0.15, stone: 0.05 },
    },
    normal: {
        label: 'Thường', thinkInterval: 1, gatherMult: 1, maxPawns: 20,
        firstAttackAt: 390, waveInterval: 180, firstWaveSize: 5, waveGrowth: 2, maxWaveSize: 16,
        ageUpPawns: 16, maxTowers: 1, maxFarms: 6, startBonus: {},
        gatherWeights: { food: 0.4, wood: 0.32, gold: 0.2, stone: 0.08 },
    },
    hard: {
        label: 'Khó', thinkInterval: 0.6, gatherMult: 1.2, maxPawns: 28,
        firstAttackAt: 270, waveInterval: 140, firstWaveSize: 6, waveGrowth: 3, maxWaveSize: 26,
        ageUpPawns: 20, maxTowers: 2, maxFarms: 8, startBonus: { food: 100, wood: 100, gold: 50 },
        gatherWeights: { food: 0.38, wood: 0.32, gold: 0.22, stone: 0.08 },
    },
};
