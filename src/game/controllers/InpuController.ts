import * as Phaser from "phaser";
import { WARRIOR_ANIMATION } from "../configs/animations/units/warrior";
import { Warrior } from "../entities/units/Warrior";

export class InputController {
    private keys: {
        up: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        attack: Phaser.Input.Keyboard.Key;
    };

    constructor(scene: Phaser.Scene) {
        const keyboard = scene.input.keyboard!;

        this.keys = {
            up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
        };
    }

    update(warrior: Warrior): void {
        if(warrior.isAttacking)
            return

        if(this.keys.left.isDown){
            warrior.moveLeft()
        } else if(this.keys.down.isDown){
            warrior.moveDown()
        } else if(this.keys.up.isDown){
            warrior.moveUp()
        } else if(this.keys.right.isDown){
            warrior.moveRight()
        } else if(this.keys.attack.isDown){
            warrior.attack()
        } else {
            warrior.idle()
        }
    }
}