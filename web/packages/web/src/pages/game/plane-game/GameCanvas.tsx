import { forwardRef } from 'react';
import styles from './styles.module.css';

interface TouchHandlers {
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: () => void;
}

interface GameCanvasProps {
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  touchHandlers: TouchHandlers;
}

export const GameCanvas = forwardRef<HTMLCanvasElement, GameCanvasProps>(
  ({ width, height, canvasWidth, canvasHeight, touchHandlers }, ref) => {
    return (
      <canvas
        ref={ref}
        className={styles.gameCanvas}
        width={canvasWidth}
        height={canvasHeight}
        style={{ width: `${width}px`, height: `${height}px` }}
        {...touchHandlers}
      />
    );
  }
);

GameCanvas.displayName = 'GameCanvas';
