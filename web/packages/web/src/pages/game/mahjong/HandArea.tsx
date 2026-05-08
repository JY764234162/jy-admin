import type { Tile } from "./types";
import { getTileLabel } from "./utils";

interface HandAreaProps {
  hand: Tile[];
  selectedTile: Tile | null;
  onSelect: (tile: Tile) => void;
  isMobile: boolean;
}

export function HandArea({ hand, selectedTile, onSelect, isMobile }: HandAreaProps) {
  const sorted = [...hand].sort((a, b) => {
    const suitOrder: Record<string, number> = { wan: 0, tong: 1, tiao: 2, zi: 3 };
    if (a.suit !== b.suit) return (suitOrder[a.suit] ?? 0) - (suitOrder[b.suit] ?? 0);
    return a.value - b.value;
  });

  return (
    <div
      className="mahjong-hand-area"
      style={{
        padding: isMobile ? 8 : 12,
        background: "#fafafa",
        borderRadius: 8,
        border: "1px solid #eee",
      }}
    >
      <div style={{ fontSize: isMobile ? 12 : 14, color: "#666", marginBottom: 8 }}>
        我的手牌 ({hand.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 4 : 8, justifyContent: "center" }}>
        {sorted.map((tile) => {
          const isSelected = selectedTile?.id === tile.id;
          return (
            <button
              key={tile.id}
              onClick={() => onSelect(tile)}
              className={`mahjong-tile hand ${tile.suit}`}
              style={{
                width: isMobile ? 32 : 44,
                height: isMobile ? 44 : 56,
                borderRadius: 6,
                border: isSelected ? "2px solid #1890ff" : "1px solid #ccc",
                background: tile.suit === "zi" ? "#fff2f0" : "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isMobile ? 14 : 18,
                fontWeight: 600,
                color: tile.suit === "zi" ? "#cf1322" : "#333",
                cursor: "pointer",
                transform: isSelected ? "translateY(-4px)" : undefined,
                boxShadow: isSelected ? "0 4px 8px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.1)",
                transition: "all 0.15s",
              }}
            >
              {getTileLabel(tile)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
