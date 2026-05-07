import type { Card, PlayerCardsMap } from "./types";

interface CardSelectorModalProps {
  availableCards: Card[];
  playerSelectedCards: PlayerCardsMap;
  selectingPlayer: number;
  onSelectingPlayerChange: (playerId: number) => void;
  onToggleCard: (card: Card) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CardSelectorModal({
  availableCards,
  playerSelectedCards,
  selectingPlayer,
  onSelectingPlayerChange,
  onToggleCard,
  onConfirm,
  onCancel,
}: CardSelectorModalProps) {
  const allSelected = Object.values(playerSelectedCards).flat();
  const currentCards = playerSelectedCards[selectingPlayer] ?? [];
  const totalSelected = allSelected.length;

  const getCardOwner = (card: Card): number | null => {
    for (let i = 1; i <= 4; i++) {
      if (playerSelectedCards[i]?.find((c) => c.id === card.id)) {
        return i;
      }
    }
    return null;
  };

  return (
    <div className="card-selector-modal-overlay" onClick={onCancel}>
      <div className="card-selector-modal card-selector-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="card-selector-header">
          <h3>自由分配牌</h3>
          <div className="total-selected-count">已分配: {totalSelected} / 52</div>
        </div>

        <div className="player-tabs">
          {[1, 2, 3, 4].map((playerId) => (
            <button
              key={playerId}
              className={`player-tab ${selectingPlayer === playerId ? "active" : ""}`}
              onClick={() => onSelectingPlayerChange(playerId)}
            >
              玩家{playerId}
              <span className="tab-count">({playerSelectedCards[playerId]?.length ?? 0}/13)</span>
            </button>
          ))}
        </div>

        <div className="players-cards-preview">
          {[1, 2, 3, 4].map((playerId) => (
            <div key={playerId} className={`player-preview ${selectingPlayer === playerId ? "active" : ""}`}>
              <div className="preview-label">
                玩家{playerId}: {playerSelectedCards[playerId]?.length ?? 0}张
              </div>
              <div className="preview-cards">
                {(playerSelectedCards[playerId]?.length ?? 0) === 0 ? (
                  <span className="no-cards">未选牌</span>
                ) : (
                  playerSelectedCards[playerId]!.map((card) => {
                    const isRed = card.suit === "♥" || card.suit === "♦";
                    return (
                      <span key={card.id} className={`preview-card ${isRed ? "red" : "black"}`}>
                        {card.suit}
                        {card.rank}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="card-selector-content">
          <div className="current-selecting-info">
            正在为 <strong>玩家{selectingPlayer}</strong> 选牌 ({currentCards.length}/13)
          </div>
          <div className="available-cards-grid">
            {availableCards.map((card) => {
              const cardOwner = getCardOwner(card);
              const isSelectedByCurrent = cardOwner === selectingPlayer;
              const isSelectedByOther = cardOwner !== null && cardOwner !== selectingPlayer;
              const isRed = card.suit === "♥" || card.suit === "♦";
              return (
                <div
                  key={card.id}
                  className={`selectable-card ${isSelectedByCurrent ? "selected" : ""} ${isSelectedByOther ? "selected-by-other" : ""} ${isRed ? "card-red" : "card-black"}`}
                  onClick={() => onToggleCard(card)}
                >
                  <div className="card-corner card-corner-top">
                    <div className="card-rank">{card.rank}</div>
                    <div className={`card-suit ${isRed ? "suit-red" : ""}`}>{card.suit}</div>
                  </div>
                  <div className="card-center">
                    <div className={`card-suit-large ${isRed ? "suit-red" : ""}`}>{card.suit}</div>
                  </div>
                  <div className="card-corner card-corner-bottom">
                    <div className="card-rank">{card.rank}</div>
                    <div className={`card-suit ${isRed ? "suit-red" : ""}`}>{card.suit}</div>
                  </div>
                  {isSelectedByCurrent && <div className="selected-badge">✓</div>}
                  {isSelectedByOther && <div className="other-player-badge">P{cardOwner}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-selector-footer">
          <div className="footer-info">剩余 {52 - totalSelected} 张牌将随机分配</div>
          <button onClick={onCancel} className="cancel-button">
            取消
          </button>
          <button onClick={onConfirm} className="confirm-button">
            确认发牌
          </button>
        </div>
      </div>
    </div>
  );
}
