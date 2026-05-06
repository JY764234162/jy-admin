import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Button, Card, Input, Spin } from "antd";
import { localStg } from "@/utils/storage";
import { layoutSlice } from "@/store/slice/layout";
import { userSlice } from "@/store/slice/user";
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
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const userInfo = useSelector(userSlice.selectors.getUserInfo);

  const savedNickname = localStorage.getItem("gomoku_nickname") || "";
  const [gameNickname, setGameNickname] = useState(() => {
    if (savedNickname) return savedNickname;
    return userInfo?.nickName || userInfo?.username || `玩家-${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [nicknameSet, setNicknameSet] = useState(() => !!savedNickname);

  const displayNickname = gameNickname;

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
  } = useGameWebSocket(DEFAULT_ROOM, token, displayNickname);

  useEffect(() => {
    if (nicknameSet) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [connect, disconnect, nicknameSet]);

  // 根据屏幕尺寸动态计算棋盘格子大小
  const cellSize = useMemo(() => {
    if (!isMobile) return 32;
    const available = Math.min(window.innerWidth - 20, 500);
    return Math.floor(available / 15);
  }, [isMobile]);

  if (!nicknameSet) {
    return (
      <div className="gomoku-lobby">
        <Card title="设置游戏昵称" style={{ width: isMobile ? "90%" : 320, maxWidth: 400 }}>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
            请输入你在游戏中的显示名称
          </p>
          <Input
            value={gameNickname}
            onChange={(e) => setGameNickname(e.target.value)}
            placeholder="例如：小明"
            maxLength={12}
            style={{ marginBottom: 16 }}
          />
          <Button
            type="primary"
            block
            onClick={() => {
              const trimmed = gameNickname.trim();
              if (!trimmed) return;
              localStorage.setItem("gomoku_nickname", trimmed);
              setNicknameSet(true);
            }}
          >
            开始游戏
          </Button>
        </Card>
      </div>
    );
  }

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

  const sidebar = (
    <div
      style={{
        width: isMobile ? "100%" : 240,
        maxWidth: isMobile ? 500 : undefined,
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 8 : 16,
        order: isMobile ? 2 : -1,
      }}
    >
      <Card size="small">
        <div style={{ textAlign: "center", fontSize: isMobile ? 14 : 15, fontWeight: 600 }}>
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
  );

  return (
    <div
      className="gomoku-container"
      style={{
        flexDirection: isMobile ? "column" : "row",
        alignItems: "center",
        padding: isMobile ? "12px 8px" : 24,
        gap: isMobile ? 12 : 24,
        height: isMobile ? "auto" : undefined,
        minHeight: isMobile ? "calc(100vh - 100px)" : undefined,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", order: isMobile ? 1 : 0 }}>
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
          cellSize={cellSize}
          onMove={move}
        />
        <div className="gomoku-status-bar" style={{ fontSize: isMobile ? 14 : 16, padding: isMobile ? "4px 0" : "8px 0" }}>
          {renderStatusBar()}
        </div>
      </div>

      {sidebar}
    </div>
  );
};
