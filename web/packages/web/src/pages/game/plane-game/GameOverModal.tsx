import styles from './styles.module.css';

interface GameOverModalProps {
  score: number;
  onRestart: () => void;
}

export function GameOverModal({ score, onRestart }: GameOverModalProps) {
  return (
    <div className={styles.gameOver}>
      <h2 className={styles.gameOverTitle}>游戏结束</h2>
      <p className={styles.finalScore}>最终分数: {score}</p>
      <button className={styles.restartBtn} onClick={onRestart}>
        重新开始
      </button>
    </div>
  );
}
