import { AUTO, Game } from 'phaser';
import { GameScene } from './scenes/GameScene';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity : {x: 0, y: 0},
            debug: true,
        },
    },
    backgroundColor: '#ffffff',
    scene: [GameScene]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
