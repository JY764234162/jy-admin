import type { RoomState, UserRole } from "./types";

interface StatusBarProps {
  roomState: RoomState;
  role: UserRole;
  isMobile: boolean;
}

export function StatusBar({ roomState, role, isMobile }: StatusBarProps) {
  const { status, currentTurn, players, winner } = roomState;

  const myColor = role === "black" ? 1 : role === "white" ? 2 : null;
  const isMyTurn = status === "playing" && myColor === currentTurn;

  const myPlayer = role === "black" ? players.black : role === "white" ? players.white : null;
  const opponent = role === "black" ? players.white : role === "white" ? players.black : null;
  const bothPresent = !!(players.black && players.white);

  if (status === "waiting") {
    if (role === "spectator") {
      return <span style={{ color: "#999" }}>等待玩家准备开局...</span>;
    }
    if (!bothPresent) {
      return <span style={{ color: "#999" }}>⏳ 等待对手加入房间...</span>;
    }
    if (myPlayer?.ready && opponent?.ready) {
      return <span style={{ color: "#52c41a" }}>双方已准备,开始游戏!</span>;
    }
    if (myPlayer?.ready && !opponent?.ready) {
      return <span style={{ color: "#1890ff" }}>✓ 你已准备,等待对手准备...</span>;
    }
    if (!myPlayer?.ready && opponent?.ready) {
      return <span style={{ color: "#fa8c16", fontWeight: 600 }}>对手已准备,请点击「准备」开始</span>;
    }
    return <span style={{ color: "#999" }}>请点击「准备」按钮开始游戏</span>;
  }

  if (status === "ended") {
    if (!winner) return <span>🤝 平局</span>;
    return <span>{winner === 1 ? "⚫ 黑方获胜" : "⚪ 白方获胜"}</span>;
  }

  const turnText = currentTurn === 1 ? "⚫ 黑方落子" : "⚪ 白方落子";
  if (role === "spectator") return <span>{turnText}</span>;

  return (
    <span style={{ color: isMyTurn ? "#1890ff" : "#999", fontWeight: isMyTurn ? 600 : 400 }}>
      {turnText} {isMyTurn ? "(你的回合,请落子)" : "(等待对手)"}
    </span>
  );
}
