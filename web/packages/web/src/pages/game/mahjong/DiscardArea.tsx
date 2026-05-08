import { getTileLabel } from "./utils";
import type { Tile } from "./types";

interface DiscardAreaProps {
  discardPile: Tile[];
  isMobile: boolean;
}

export function DiscardArea({ discardPile, isMobile }: DiscardAreaProps) {
  return (
    <div
      className="mahjong-discard-area"
      style={{
        padding: isMobile ? 8 : 16,
        background: "#f0f0f0",
        borderRadius: 8,
        minHeight: isMobile ? 80 : 120,
      }}
    >
      <div style={{ fontSize: isMobile ? 12 : 14, color: "#666", marginBottom: 8 }}>
        弃牌堆 ({discardPile.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 3 : 6 }}>
        {discardPile.map((tile, idx) => (
          <div
            key={tile.id + idx}
            className={`mahjong-tile discard ${tile.suit}`}
            style={{
              width: isMobile ? 28 : 36,
              height: isMobile ? 38 : 48,
              borderRadius: 4,
              border: "1px solid #ccc",
              background: tile.suit === "zi" ? "#fff2f0" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isMobile ? 12 : 14,
              fontWeight: 600,
              color: tile.suit === "zi" ? "#cf1322" : "#333",
            }}
          >
            {getTileLabel(tile)}
          </div>
        ))}
      </div>
    </div>
  );
}
