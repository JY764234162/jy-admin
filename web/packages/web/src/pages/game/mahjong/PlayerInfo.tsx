import { Avatar, Badge, Tag } from "antd";
import type { PlayerInfo as PlayerInfoType } from "./types";
import { getTileLabel } from "./utils";

interface PlayerInfoProps {
  player?: PlayerInfoType;
  isCurrent: boolean;
  isMe: boolean;
  isDealer: boolean;
  isMobile: boolean;
}

export function PlayerInfo({ player, isCurrent, isMe, isDealer, isMobile }: PlayerInfoProps) {
  if (!player) {
    return (
      <div
        className="mahjong-player-empty"
        style={{
          padding: isMobile ? 8 : 12,
          borderRadius: 8,
          background: "#f5f5f5",
          textAlign: "center",
          color: "#999",
          fontSize: isMobile ? 12 : 14,
        }}
      >
        等待加入...
      </div>
    );
  }

  return (
    <div
      className="mahjong-player"
      style={{
        padding: isMobile ? 8 : 12,
        borderRadius: 8,
        background: isCurrent ? "#e6f7ff" : "#fafafa",
        border: isCurrent ? "1px solid #1890ff" : "1px solid #eee",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        minWidth: isMobile ? 70 : 100,
      }}
    >
      <Badge
        dot={isCurrent}
        color="#1890ff"
      >
        <Avatar size={isMobile ? 32 : 40} style={{ background: isMe ? "#52c41a" : "#1890ff" }}>
          {player.userId.slice(0, 1)}
        </Avatar>
      </Badge>
      <div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {player.userId}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {isDealer && <Tag color="red" style={{ fontSize: 10, padding: "0 4px" }}>庄</Tag>}
        {player.isBot && <Tag color="orange" style={{ fontSize: 10, padding: "0 4px" }}>托管</Tag>}
        {player.ready && <Tag color="green" style={{ fontSize: 10, padding: "0 4px" }}>已准备</Tag>}
      </div>
      <div style={{ fontSize: isMobile ? 11 : 12, color: "#666" }}>
        {player.handCount}张
      </div>
      {player.melds.length > 0 && (
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
          {player.melds.map((meld, idx) => (
            <span
              key={idx}
              style={{
                fontSize: 10,
                padding: "1px 4px",
                background: meld.type === "gang" ? "#ffccc7" : "#d9f7be",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {meld.type === "gang" ? "杠" : "碰"} {meld.tiles[0] ? getTileLabel(meld.tiles[0]) : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
