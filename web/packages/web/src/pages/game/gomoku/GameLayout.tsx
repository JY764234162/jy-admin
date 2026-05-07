import { Card } from "antd";
import type { RoomState, UserRole } from "./types";
import type { OpponentDisconnectInfo } from "./useGameWebSocket";
import { Board } from "./Board";
import { GameInfo } from "./GameInfo";
import { GameControls } from "./GameControls";
import { DisconnectBanner } from "./DisconnectBanner";
import { StatusBar } from "./StatusBar";

interface GameLayoutProps {
  roomState: RoomState;
  role: UserRole;
  isMobile: boolean;
  cellSize: number;
  opponentDisconnected: OpponentDisconnectInfo | null;
  pendingUndoFrom: string | null;
  pendingRestartFrom: string | null;
  onMove: (row: number, col: number) => void;
  onReady: () => void;
  onUnready: () => void;
  onUndo: () => void;
  onRespondUndo: (accept: boolean) => void;
  onSurrender: () => void;
  onRestart: () => void;
  onRespondRestart: (accept: boolean) => void;
}

export function GameLayout({
  roomState,
  role,
  isMobile,
  cellSize,
  opponentDisconnected,
  pendingUndoFrom,
  pendingRestartFrom,
  onMove,
  onReady,
  onUnready,
  onUndo,
  onRespondUndo,
  onSurrender,
  onRestart,
  onRespondRestart,
}: GameLayoutProps) {
  const lastMove =
    (roomState.moveHistory?.length ?? 0) > 0
      ? roomState.moveHistory[roomState.moveHistory.length - 1]
      : null;

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
      <GameInfo roomState={roomState} role={role} onReady={onReady} onUnready={onUnready} />
      {roomState.status !== "waiting" && (
        <Card size="small" title="操作">
          <GameControls
            role={role}
            status={roomState.status}
            pendingUndoFrom={pendingUndoFrom}
            pendingRestartFrom={pendingRestartFrom}
            onUndo={onUndo}
            onRespondUndo={onRespondUndo}
            onSurrender={onSurrender}
            onRestart={onRestart}
            onRespondRestart={onRespondRestart}
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
          onMove={onMove}
        />
        <div
          className="gomoku-status-bar"
          style={{ fontSize: isMobile ? 14 : 16, padding: isMobile ? "4px 0" : "8px 0" }}
        >
          <StatusBar roomState={roomState} role={role} isMobile={isMobile} />
        </div>
      </div>
      {sidebar}
    </div>
  );
}
