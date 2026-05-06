import { Button, Card, Tag } from "antd";
import type { RoomState, UserRole } from "./types";

interface GameInfoProps {
  roomState: RoomState;
  role: UserRole;
  onReady: () => void;
  onUnready: () => void;
}

export function GameInfo({ roomState, role, onReady, onUnready }: GameInfoProps) {
  const { players, currentTurn, status, moveHistory, winner } = roomState;
  const history = moveHistory ?? [];

  const statusText = () => {
    if (status === "waiting") return "等待开始";
    if (status === "ended") {
      if (!winner) return "平局";
      return winner === 1 ? "黑方胜" : "白方胜";
    }
    return currentTurn === 1 ? "黑方落子中" : "白方落子中";
  };

  const renderPlayer = (color: "black" | "white", player: RoomState["players"]["black"]) => {
    const isCurrent = status === "playing" && currentTurn === (color === "black" ? 1 : 2);
    const isMe = role === color;
    const showReadyControls = status === "waiting" && players.black && players.white;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 8,
          background: isCurrent ? "#e6f7ff" : "#fafafa",
          border: isCurrent ? "2px solid #1890ff" : "2px solid transparent",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: color === "black"
              ? "radial-gradient(circle at 35% 35%, #555, #111)"
              : "radial-gradient(circle at 35% 35%, #fff, #ccc)",
            border: color === "white" ? "1px solid #aaa" : "none",
            boxShadow: "1px 1px 2px rgba(0,0,0,0.3)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, fontWeight: isMe ? 600 : 400, fontSize: 13 }}>
          {player ? (isMe ? `你 (${player.userId})` : player.userId) : "等待加入..."}
        </span>
        {showReadyControls && player && (
          isMe ? (
            <Button
              size="small"
              type={player.ready ? "default" : "primary"}
              onClick={player.ready ? onUnready : onReady}
            >
              {player.ready ? "取消准备" : "准备"}
            </Button>
          ) : (
            <Tag color={player.ready ? "green" : "default"}>
              {player.ready ? "已准备" : "未准备"}
            </Tag>
          )
        )}
      </div>
    );
  };

  return (
    <Card size="small" title="游戏信息" style={{ width: "100%" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <Tag color={status === "playing" ? "blue" : status === "ended" ? "red" : "default"}>
          {statusText()}
        </Tag>
        {role === "spectator" && <Tag color="orange">观战中</Tag>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {renderPlayer("black", players.black)}
        {renderPlayer("white", players.white)}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#999", textAlign: "center" }}>
        第 {history.length} 手
      </div>
    </Card>
  );
}
