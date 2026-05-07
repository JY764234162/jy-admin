import { useState, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';
import { getResponsiveCanvasSize } from './utils';
import { usePlaneGame } from './usePlaneGame';
import { GameCanvas } from './GameCanvas';
import { GameHUD } from './GameHUD';
import { GameOverModal } from './GameOverModal';
import styles from './styles.module.css';

export const Component = () => {
  const [canvasSize, setCanvasSize] = useState(getResponsiveCanvasSize);
  const { canvasRef, score, lives, gameOver, restart, touchHandlers } = usePlaneGame();

  useEffect(() => {
    const handleResize = () => setCanvasSize(getResponsiveCanvasSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={styles.gameWrapper}>
      <div
        className={styles.gameContainer}
        style={{ width: canvasSize.width, height: canvasSize.height }}
      >
        <GameCanvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          canvasWidth={CANVAS_WIDTH}
          canvasHeight={CANVAS_HEIGHT}
          touchHandlers={touchHandlers}
        />
        <GameHUD score={score} lives={lives} />
        {gameOver && <GameOverModal score={score} onRestart={restart} />}
        <div className={styles.instructions}>
          PC: 方向键/WASD移动 + 空格发射 | 移动端: 触摸屏幕控制
        </div>
      </div>
    </div>
  );
};
