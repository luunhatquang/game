import { AUTO, Game, Scale } from 'phaser';
import { GameScene } from './scenes/GameScene';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    backgroundColor: '#47aba9',
    scale: {
        mode: Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight,
    },
    scene: [GameScene]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
