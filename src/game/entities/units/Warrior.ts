import * as Phaser from 'phaser';
import { WARRIOR_SPRITESHEETS } from '../../configs/spritesheet/units/warrior';
import { WarriorColor } from '../../types/units';
import { WARRIOR_ANIMATION } from '../../configs/animations/units/warrior';

export class Warrior extends Phaser.Physics.Arcade.Sprite {
    private speed: number = 150
    direction: boolean = false
    color!: WarriorColor
    isAttacking: boolean = false
    constructor(
        scene: Phaser.Scene, 
        x: number, 
        y: number,
        color: WarriorColor
    ) {
        const spritesheet = WARRIOR_SPRITESHEETS[color].IDLE

        super(scene, x, y, spritesheet.key);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        
        this.color = color
        this.setSize(spritesheet.size.width, spritesheet.size.height)
        this.setScale(spritesheet.scale)
        this.setCollideWorldBounds(true);
    }

    idle(){
        this.play(WARRIOR_ANIMATION[this.color]["IDLE"].key, true)
        this.setVelocityX(0)
        this.setVelocityY(0)
    }

    moveRight(){
        this.direction = false
        this.setFlipX(this.direction)
        this.setVelocityX(this.speed)
        this.play(WARRIOR_ANIMATION[this.color]["RUN"].key, true)
    }

    moveLeft(){
        this.direction = true
        this.setFlipX(this.direction)
        this.setVelocityX(-this.speed)
        this.play(WARRIOR_ANIMATION[this.color]["RUN"].key, true)
    }

    moveUp(){
        this.setFlipX(this.direction)
        this.setVelocityY(-this.speed)
        this.play(WARRIOR_ANIMATION[this.color]["RUN"].key, true)
    }

    moveDown(){
        this.setFlipX(this.direction)
        this.setVelocityY(this.speed)
        this.play(WARRIOR_ANIMATION[this.color]["RUN"].key, true)
    }

    attack(){
        this.play(WARRIOR_ANIMATION[this.color]["ATTACK1"].key, true)
        this.isAttacking = true
        this.once(
            Phaser.Animations.Events.ANIMATION_COMPLETE,
            ()=>{
                this.isAttacking = false
            }
        )
    }
}
