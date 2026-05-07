interface GameControlsProps {
  onDeal: () => void;
  onOpenSelector: () => void;
  onQuickDeal: () => void;
  onReset: () => void;
  canQuickDeal: boolean;
}

export function GameControls({
  onDeal,
  onOpenSelector,
  onQuickDeal,
  onReset,
  canQuickDeal,
}: GameControlsProps) {
  return (
    <div className="game-controls">
      <button onClick={onDeal} className="deal-button">
        发牌
      </button>
      <button onClick={onOpenSelector} className="select-button">
        选牌
      </button>
      <button
        onClick={onQuickDeal}
        className="quick-deal-button"
        disabled={!canQuickDeal}
        title={!canQuickDeal ? "请先使用选牌功能选择牌" : "使用上次选中的牌快速发牌"}
      >
        快速发牌
      </button>
      <button onClick={onReset} className="reset-button">
        重新开始
      </button>
    </div>
  );
}
