import type { Card } from "./types";

interface PlayedCardsAreaProps {
  cards: Card[];
  playedBy: number | null;
}

export function PlayedCardsArea({ cards, playedBy }: PlayedCardsAreaProps) {
  if (cards.length === 0) return null;

  return (
    <div className="center-played-cards">
      <div className="played-by">玩家{playedBy}出的牌</div>
      <div className="played-cards-container">
        {cards.map((card, index) => {
          const isRed = card.suit === "♥" || card.suit === "♦";
          return (
            <div
              key={card.id}
              className={`card played-card ${isRed ? "card-red" : "card-black"}`}
              style={{ marginLeft: index === 0 ? 0 : "-25px", zIndex: index }}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
