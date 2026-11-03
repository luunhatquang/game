export interface SpritesheetConfig {
    key: string,
    path: string,
    spriteSize : {
        frameHeight: number,
        frameWidth: number
    },
    size : {
        width: number,
        height: number
    },
    scale: number
}

export interface AnimationConfig {
    key: string,
    spritesheetKey: string,
    frameRate: number,
    repeat: number,
    framesConfigInterval?: { 
        start: number,
        end: number 
    },
    framesConfigArray?: number[]
}