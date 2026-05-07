import { useSelector } from "react-redux";
import { layoutSlice } from "@/store/slice/layout";
import type { Card } from "./types";
import "./index.css";

interface CardComponentProps {
  card: Card;
  index: number;
  playerId: number;
  isSelected: boolean;
  isCurrentPlayer: boolean;
  onClick: () => void;
}

export function CardComponent({
  card,
  index,
  playerId,
  isSelected,
  isCurrentPlayer,
  onClick,
}: CardComponentProps) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);

  let marginStyle: React.CSSProperties = {};
  if (playerId === 1) {
    marginStyle = { marginLeft: index === 0 ? 0 : isMobile ? "-50px" : "-25px", marginTop: 0 };
  } else if (playerId === 2) {
    marginStyle = { marginTop: index === 0 ? 0 : isMobile ? "-80px" : "-50px", marginLeft: 0 };
  } else if (playerId === 3) {
    marginStyle = { marginLeft: index === 0 ? 0 : isMobile ? "-50px" : "-25px", marginTop: 0 };
  } else if (playerId === 4) {
    marginStyle = { marginTop: index === 0 ? 0 : isMobile ? "-80px" : "-50px", marginLeft: 0 };
  }

  return (
    <div
      className={`card ${isRed ? "card-red" : "card-black"} ${isSelected ? "card-selected" : ""} ${isCurrentPlayer ? "card-clickable" : ""}`}
      style={{
        transform: `translateY(${isSelected ? "-15px" : "0"})`,
        zIndex: index,
        position: "relative",
        ...marginStyle,
      }}
      onClick={onClick}
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
}
