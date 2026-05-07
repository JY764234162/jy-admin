import styles from './styles.module.css';

interface GameHUDProps {
  score: number;
  lives: number;
}

export function GameHUD({ score, lives }: GameHUDProps) {
  return (
    <div className={styles.ui}>
      <div>分数: {score}</div>
      <div>生命: {lives}</div>
    </div>
  );
}
