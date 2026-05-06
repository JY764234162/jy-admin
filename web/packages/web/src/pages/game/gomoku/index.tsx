import { useEffect, useState } from "react";
import { Alert, Button, Card, Spin } from "antd";
import { localStg } from "@/utils/storage";
import { useGameWebSocket } from "./useGameWebSocket";
import { Board } from "./Board";
import { GameInfo } from "./GameInfo";
import { GameControls } from "./GameControls";

const DEFAULT_ROOM = "gomoku-default";

function DisconnectBanner({ userId, color, graceEndsAt }: { userId: string; color: string; graceEndsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((graceEndsAt - now) / 1000));
  const colorText = color === "black" ? "黑方" : color === "white" ? "白方" : "对手";
  return (
    <Alert
      type="warning"
      showIcon
      message={`${colorText} (${userId}) 已掉线,等待重连...`}
      description={`${remaining}s 内未重连将判负`}
      style={{ marginBottom: 12 }}
    />
  );
}

export const Component = () => {
  const token = localStg.get("token") || "";

  const {
    roomState,
    role,
    connectionStatus,
    pendingUndoFrom,
    pendingRestartFrom,
    opponentDisconnected,
    connect,
    disconnect,
    ready,
    unready,
    requestUndo,
    respondUndo,
    surrender,
    requestRestart,
    respondRestart,
    move,
  } = useGameWebSocket(DEFAULT_ROOM, token);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  if (connectionStatus === "connecting" || connectionStatus === "idle") {
    return (
      <div className="gomoku-lobby">
        <Spin size="large" />
        <p style={{ color: "#666" }}>正在连接...</p>
      </div>
    );
  }

  if (connectionStatus === "error") {
    return (
      <div className="gomoku-lobby">
        <p style={{ color: "#ff4d4f", fontSize: 18 }}>连接失败</p>
        <Button type="primary" onClick={connect}>重新连接</Button>
      </div>
    );
  }

  if (!roomState) return null;

  const lastMove = (roomState.moveHistory?.length ?? 0) > 0
    ? roomState.moveHistory[roomState.moveHistory.length - 1]
    : null;

  const myColor = role === "black" ? 1 : role === "white" ? 2 : null;
  const isMyTurn = roomState.status === "playing" && myColor === roomState.currentTurn;

  const myPlayer = role === "black" ? roomState.players.black : role === "white" ? roomState.players.white : null;
  const opponent = role === "black" ? roomState.players.white : role === "white" ? roomState.players.black : null;
  const bothPresent = !!(roomState.players.black && roomState.players.white);

  const renderStatusBar = () => {
    if (roomState.status === "waiting") {
      if (role === "spectator") {
        return <span style={{ color: "#999" }}>等待玩家准备开局...</span>;
      }
      if (!bothPresent) {
        return <span style={{ color: "#999" }}>⏳ 等待对手加入房间...</span>;
      }
      // 两人都在,根据准备状态提示
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
    if (roomState.status === "ended") {
      if (!roomState.winner) return <span>🤝 平局</span>;
      return <span>{roomState.winner === 1 ? "⚫ 黑方获胜" : "⚪ 白方获胜"}</span>;
    }
    const turnText = roomState.currentTurn === 1 ? "⚫ 黑方落子" : "⚪ 白方落子";
    if (role === "spectator") return <span>{turnText}</span>;
    return (
      <span style={{ color: isMyTurn ? "#1890ff" : "#999", fontWeight: isMyTurn ? 600 : 400 }}>
        {turnText} {isMyTurn ? "(你的回合,请落子)" : "(等待对手)"}
      </span>
    );
  };

  return (
    <div className="gomoku-container">
      <div className="gomoku-sidebar">
        <Card size="small">
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600 }}>
            {role === "black" && <span style={{ color: "#000" }}>⚫ 你是黑方</span>}
            {role === "white" && <span style={{ color: "#666" }}>⚪ 你是白方</span>}
            {role === "spectator" && <span style={{ color: "#fa8c16" }}>👀 观战者</span>}
          </div>
        </Card>
        <GameInfo roomState={roomState} role={role} onReady={ready} onUnready={unready} />
        {roomState.status !== "waiting" && (
          <Card size="small" title="操作">
            <GameControls
              role={role}
              status={roomState.status}
              pendingUndoFrom={pendingUndoFrom}
              pendingRestartFrom={pendingRestartFrom}
              onUndo={requestUndo}
              onRespondUndo={respondUndo}
              onSurrender={surrender}
              onRestart={requestRestart}
              onRespondRestart={respondRestart}
            />
          </Card>
        )}
      </div>

      <div>
        {opponentDisconnected && (
          <DisconnectBanner
            userId={opponentDisconnected.userId}
            color={opponentDisconnected.color}
            graceEndsAt={opponentDisconnected.graceEndsAt}
          />
        )}
        <Board
          board={roomState.board}
          role={role}
          currentTurn={roomState.currentTurn}
          isPlaying={roomState.status === "playing"}
          lastMove={lastMove ? { row: lastMove.row, col: lastMove.col } : null}
          winningLine={null}
          onMove={move}
        />
        <div className="gomoku-status-bar">
          {renderStatusBar()}
        </div>
      </div>
    </div>
  );
};
