import type { Card, Player } from "./types";
import { CardComponent } from "./CardComponent";

interface PlayerAreaProps {
  player: Player;
  isCurrentPlayer: boolean;
  playingCards: Card[];
  onCardClick: (card: Card, playerId: number) => void;
  onPlayCards: () => void;
  onPassPlay: () => void;
}

export function PlayerArea({
  player,
  isCurrentPlayer,
  playingCards,
  onCardClick,
  onPlayCards,
  onPassPlay,
}: PlayerAreaProps) {
  const selectedCount = playingCards.length;

  return (
    <div className={`player player-${player.id} ${isCurrentPlayer ? "current-player" : ""}`}>
      <div className="player-header">
        <div className="player-label">{player.name}</div>
        {isCurrentPlayer && (
          <div className="player-actions">
            <button
              onClick={onPlayCards}
              className="play-button-small"
              disabled={selectedCount === 0}
            >
              出牌{selectedCount > 0 && ` (${selectedCount})`}
            </button>
            <button onClick={onPassPlay} className="pass-button-small">
              不出
            </button>
          </div>
        )}
      </div>
      <div
        className="cards-container"
        style={{
          flexDirection:
            player.position === "left" || player.position === "right" ? "column" : "row",
        }}
      >
        {player.cards.map((card, index) => {
          const isSelected = !!playingCards.find((c) => c.id === card.id);
          return (
            <CardComponent
              key={card.id}
              card={card}
              index={index}
              playerId={player.id}
              isSelected={isSelected}
              isCurrentPlayer={isCurrentPlayer}
              onClick={() => onCardClick(card, player.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
