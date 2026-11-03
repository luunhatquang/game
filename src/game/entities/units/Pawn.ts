import { Physics, Scene } from 'phaser';
import { PawnColor } from '../../types/units';
import { PAWN_ANIMATION } from '../../configs/animations/units/pawn';
import { PAWN_SPRITESHEETS } from '../../configs/spritesheet/units/pawn';

export class Pawn extends Physics.Arcade.Sprite {
    private speed: number = 200
    direction: boolean = false
    color!: PawnColor
    constructor(
        scene: Scene, 
        x: number, 
        y: number,
        color: PawnColor
    ) {
        const spritesheet = PAWN_SPRITESHEETS[color].IDLE

        super(scene, x, y, spritesheet.key);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        this.color = color
        this.setSize(spritesheet.size.width, spritesheet.size.height)
        this.setScale(spritesheet.scale)
        this.setCollideWorldBounds(true);
    }

    idle(){
        this.play(PAWN_ANIMATION[this.color]["IDLE"].key, true)
        this.setVelocityX(0)
    }

    moveRight(){
        this.direction = false
        this.setFlipX(this.direction)
        this.setVelocityX(this.speed)
        this.play(PAWN_ANIMATION[this.color]["RUN"].key, true)
    }

    moveLeft(){
        this.direction = true
        this.setFlipX(this.direction)
        this.setVelocityX(-this.speed)
        this.play(PAWN_ANIMATION[this.color]["RUN"].key, true)
    }

    moveUp(){
        this.setFlipX(this.direction)
        this.setVelocityY(-this.speed)
    }

    moveDown(){
        this.setFlipX(this.direction)
        this.setVelocityY(this.speed)
    }

    attack(){
        this.play(PAWN_ANIMATION[this.color]["INTERACT_KNIFE"].key, true)
    }
}
