import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Spin } from "antd";
import { localStg } from "@/utils/storage";
import { layoutSlice } from "@/store/slice/layout";
import { userSlice } from "@/store/slice/user";
import { useGameWebSocket } from "./useGameWebSocket";
import { NicknameSetup } from "./NicknameSetup";
import { GameLayout } from "./GameLayout";
import { getCellSize } from "./utils";
import { DEFAULT_ROOM, NICKNAME_STORAGE_KEY } from "./constants";
import "./index.css";

export const Component = () => {
  const token = localStg.get("token") || "";
  const isMobile = useSelector(layoutSlice.selectors.getIsMobile);
  const userInfo = useSelector(userSlice.selectors.getUserInfo);

  const savedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY) || "";
  const [nickname, setNickname] = useState(() => {
    if (savedNickname) return savedNickname;
    return userInfo?.nickName || userInfo?.username || `玩家-${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [nicknameSet, setNicknameSet] = useState(() => !!savedNickname);

  const ws = useGameWebSocket(DEFAULT_ROOM, token, nickname);

  useEffect(() => {
    if (nicknameSet) {
      ws.connect();
    }
    return () => {
      ws.disconnect();
    };
  }, [ws.connect, ws.disconnect, nicknameSet]);

  const cellSize = useMemo(() => getCellSize(isMobile), [isMobile]);

  if (!nicknameSet) {
    return (
      <NicknameSetup
        isMobile={isMobile}
        defaultNickname={nickname}
        onConfirm={(name) => {
          setNickname(name);
          setNicknameSet(true);
        }}
      />
    );
  }

  if (ws.connectionStatus === "connecting" || ws.connectionStatus === "idle") {
    return (
      <div className="gomoku-lobby">
        <Spin size="large" />
        <p style={{ color: "#666" }}>正在连接...</p>
      </div>
    );
  }

  if (ws.connectionStatus === "error") {
    return (
      <div className="gomoku-lobby">
        <p style={{ color: "#ff4d4f", fontSize: 18 }}>连接失败</p>
        <Button type="primary" onClick={ws.connect}>重新连接</Button>
      </div>
    );
  }

  if (!ws.roomState) return null;

  return (
    <GameLayout
      roomState={ws.roomState}
      role={ws.role}
      isMobile={isMobile}
      cellSize={cellSize}
      opponentDisconnected={ws.opponentDisconnected}
      pendingUndoFrom={ws.pendingUndoFrom}
      pendingRestartFrom={ws.pendingRestartFrom}
      onMove={ws.move}
      onReady={ws.ready}
      onUnready={ws.unready}
      onUndo={ws.requestUndo}
      onRespondUndo={ws.respondUndo}
      onSurrender={ws.surrender}
      onRestart={ws.requestRestart}
      onRespondRestart={ws.respondRestart}
    />
  );
};
